import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, asc } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { conversations, messages, participants } from "@/lib/schema"

const client = new Anthropic()

export async function POST(
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

  if (msgs.length === 0) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const participant = await db.query.participants.findFirst({
    where: eq(participants.id, participantId),
  })

  const existingMemory = participant?.memory ?? null

  const transcript = msgs
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n")

  const systemPrompt = `You are a memory assistant. Your job is to maintain a concise, structured memory note about a user based on their conversation history with an AI assistant.

The memory note should capture:
- Topics or domains the user works on or cares about
- Personal details the user has shared (name/alias, role, context)
- Communication preferences or patterns you've noticed
- Recurring themes, concerns, or goals
- Any important decisions or conclusions reached

Keep the note under 300 words. Write it as plain prose or a short bullet list — no headers, no fluff. Only include what's genuinely useful context for a future conversation.`

  const userContent = existingMemory
    ? `Here is the existing memory note for this user:\n\n${existingMemory}\n\n---\n\nHere is a new conversation to incorporate:\n\n${transcript}\n\n---\n\nUpdate the memory note to reflect what you've learned. Merge new information with existing information. Remove anything that's been superseded or is no longer relevant.`
    : `Here is a conversation with a user:\n\n${transcript}\n\n---\n\nWrite a memory note for this user based on what you've learned.`

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  })

  const newMemory = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .trim()

  await db
    .update(participants)
    .set({ memory: newMemory })
    .where(eq(participants.id, participantId))

  return NextResponse.json({ ok: true, memory: newMemory })
}
