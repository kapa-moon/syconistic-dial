import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc, inArray, isNotNull, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversations, messages } from "@/lib/schema"

export async function GET() {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const convs = await db.query.conversations.findMany({
    where: eq(conversations.participantId, participantId),
    orderBy: desc(conversations.updatedAt),
  })

  // Single query to get the first sycophancy score for each conversation
  const scoreRows =
    convs.length > 0
      ? await db
          .select({ conversationId: messages.conversationId, sycophancyScore: messages.sycophancyScore })
          .from(messages)
          .where(
            and(
              inArray(messages.conversationId, convs.map((c) => c.id)),
              eq(messages.role, "assistant"),
              isNotNull(messages.sycophancyScore)
            )
          )
          .orderBy(messages.createdAt)
      : []

  const scoreByConv: Record<string, number> = {}
  for (const row of scoreRows) {
    if (row.conversationId && row.sycophancyScore != null && !(row.conversationId in scoreByConv)) {
      scoreByConv[row.conversationId] = row.sycophancyScore
    }
  }

  return NextResponse.json({
    conversations: convs.map((c) => ({ ...c, sycophancyScore: scoreByConv[c.id] ?? null })),
  })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { title } = await req.json()

  const [conv] = await db
    .insert(conversations)
    .values({
      participantId,
      title: (title ?? "").trim().slice(0, 100) || "New conversation",
    })
    .returning()

  return NextResponse.json(conv)
}
