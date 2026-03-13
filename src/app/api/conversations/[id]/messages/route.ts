import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversations, messages } from "@/lib/schema"

interface MessagePayload {
  role: string
  content: string
  thinking?: string | null
  sycophancyScore?: number | null
}

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

export async function POST(
  req: Request,
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

  const { messages: msgs }: { messages: MessagePayload[] } = await req.json()

  for (const msg of msgs) {
    await db.insert(messages).values({
      conversationId: id,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking ?? null,
      sycophancyScore: msg.sycophancyScore ?? null,
    })
  }

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, id))

  return NextResponse.json({ ok: true })
}

// PATCH — update the sycophancyScore on the Nth assistant message (0-based turnIndex)
// Used to record the user's level choice during exploration turns.
export async function PATCH(
  req: Request,
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

  const { turnIndex, sycophancyScore }: { turnIndex: number; sycophancyScore: number } = await req.json()

  // Get all messages for this conversation sorted by creation time
  const allMsgs = await db.query.messages.findMany({
    where: eq(messages.conversationId, id),
    orderBy: asc(messages.createdAt),
  })

  // Find the (turnIndex)th assistant message (0-based)
  const assistantMsgs = allMsgs.filter((m) => m.role === "assistant")
  const target = assistantMsgs[turnIndex]

  if (!target) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 })
  }

  await db
    .update(messages)
    .set({ sycophancyScore })
    .where(eq(messages.id, target.id))

  return NextResponse.json({ ok: true })
}
