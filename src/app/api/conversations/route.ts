import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversations } from "@/lib/schema"

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

  return NextResponse.json({ conversations: convs })
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
