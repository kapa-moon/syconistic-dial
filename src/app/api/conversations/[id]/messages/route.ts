import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversations, messages } from "@/lib/schema"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
  })

  if (!conv || conv.participantId !== participantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const msgs = await db.query.messages.findMany({
    where: eq(messages.conversationId, id),
    orderBy: asc(messages.createdAt),
  })

  return NextResponse.json({
    messages: msgs.map((m) => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking ?? null,
      createdAt: m.createdAt?.toISOString() ?? null,
      sycophancyScore: m.sycophancyScore ?? null,
    })),
  })
}
