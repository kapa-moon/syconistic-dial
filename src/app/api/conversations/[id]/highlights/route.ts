import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversations, highlights } from "@/lib/schema"

async function getParticipantId() {
  const cookieStore = await cookies()
  return cookieStore.get("participant_id")?.value
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const participantId = await getParticipantId()
  if (!participantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) })
  if (!conv || conv.participantId !== participantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const rows = await db.query.highlights.findMany({
    where: eq(highlights.conversationId, id),
    orderBy: asc(highlights.createdAt),
  })

  return NextResponse.json({
    highlights: rows.map((r) => ({
      id: r.id,
      messageIndex: r.messageIndex,
      selectedText: r.selectedText,
      reaction: r.reaction ?? null,
      comment: r.comment ?? null,
      createdAt: r.createdAt,
    })),
  })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const participantId = await getParticipantId()
  if (!participantId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const conv = await db.query.conversations.findFirst({ where: eq(conversations.id, id) })
  if (!conv || conv.participantId !== participantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { messageIndex, selectedText, reaction, comment } = await req.json()

  const [row] = await db
    .insert(highlights)
    .values({
      conversationId: id,
      participantId,
      messageIndex,
      selectedText,
      reaction: reaction ?? null,
      comment: comment ?? null,
    })
    .returning()

  return NextResponse.json({ highlight: { id: row.id, messageIndex, selectedText, reaction, comment } })
}
