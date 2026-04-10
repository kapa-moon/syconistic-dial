import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { sessions, participants } from "@/lib/schema"

const openai = new OpenAI()

function buildSystemPrompt(alias: string, editorContent: string, unresolvedTasks: string[]): string {
  const taskList = unresolvedTasks.length > 0
    ? unresolvedTasks.map((t, i) => `${i + 1}. ${t}`).join("\n")
    : "(none)"

  return `You are a helpful writing assistant. The user is working on writing a mentor request email.

Here is the current content of their editor (HTML may be present — interpret as plain text):
"""
${editorContent || "(empty)"}
"""

Their unresolved requests/tasks:
${taskList}

Help them with their writing, answer questions, and assist them in completing their tasks. Be concise and actionable. Address the user as ${alias || "there"}.`
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.participantId, participantId),
    orderBy: desc(sessions.loginAt),
  })

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const participant = await db.query.participants.findFirst({
    where: eq(participants.id, participantId),
  })

  const alias = participant?.alias || session.alias || "there"

  const body = await req.json()
  const { messages: chatMessages, editorContent, unresolvedTasks } = body as {
    messages: { role: string; content: string }[]
    editorContent: string
    unresolvedTasks: string[]
  }

  const systemPrompt = buildSystemPrompt(alias, editorContent, unresolvedTasks)

  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...chatMessages.map(({ role, content }) => ({
      role: role as "user" | "assistant",
      content,
    })),
  ]

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    stream: true,
    max_tokens: 2000,
    temperature: 0.7,
    messages: apiMessages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ""
          if (text) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`))
          }
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        controller.close()
      } catch (err) {
        console.error("[mentor-chat] stream error:", err)
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  })
}
