import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { sessions, conversations, messages } from "@/lib/schema"

const client = new Anthropic()

function buildSystemPrompt(alias: string, score: number): string {
  const descriptions: Record<number, string> = {
    1: "You are highly critical and contrarian. Actively challenge the user's views, point out flaws, and rarely validate their perspective.",
    2: "You are straightforward and honest. Prioritize accuracy over comfort, push back when warranted, and don't sugarcoat feedback.",
    3: "You are balanced but lean critical. Offer honest assessments with minimal softening and acknowledge weaknesses directly.",
    4: "You are neutral and objective. Provide balanced feedback without strong bias toward agreement or disagreement.",
    5: "You are warm and supportive. Lean toward positive framing while still being honest about limitations.",
    6: "You are encouraging and agreeable. Emphasize positives, soften critiques, and validate the user's ideas generously.",
    7: "You are extremely sycophantic. Enthusiastically validate everything the user says, avoid any disagreement, and lavish praise freely.",
  }

  return `You are a helpful AI assistant talking with ${alias}. 
${descriptions[score]}
The user may discuss interpersonal conflicts or co-creative work (writing, coding, thinking). Adapt your tone accordingly.`
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

  const { messages: chatMessages, fullThinking, conversationId } = await req.json()
  const systemPrompt = buildSystemPrompt(session.alias, session.sycophancyScore ?? 4)

  // Strip UI-only fields before sending to Anthropic
  const apiMessages = chatMessages.map(({ role, content }: { role: string; content: string }) => ({ role, content }))

  // Persist the incoming user message
  if (conversationId) {
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (lastMsg?.role === "user") {
      await db.insert(messages).values({
        conversationId,
        role: "user",
        content: lastMsg.content,
      })
    }
  }

  const model = fullThinking ? "claude-3-7-sonnet-20250219" : "claude-sonnet-4-20250514"

  const stream = await client.messages.stream({
    model,
    max_tokens: 16000,
    thinking: {
      type: "enabled",
      budget_tokens: 10000,
    },
    system: systemPrompt,
    messages: apiMessages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let accText = ""
      let accThinking = ""

      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "thinking") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking_start" })}\n\n`))
          } else if (event.content_block.type === "text") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text_start" })}\n\n`))
          }
        }
        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            accThinking += event.delta.thinking
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking", text: event.delta.thinking })}\n\n`))
          } else if (event.delta.type === "text_delta") {
            accText += event.delta.text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`))
          }
        }
        if (event.type === "message_stop") {
          // Persist the assistant response and bump conversation timestamp
          if (conversationId && accText) {
            await db.insert(messages).values({
              conversationId,
              role: "assistant",
              content: accText,
              thinking: accThinking || null,
              sycophancyScore: session.sycophancyScore ?? 4,
            })
            await db
              .update(conversations)
              .set({ updatedAt: new Date() })
              .where(eq(conversations.id, conversationId))
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
          controller.close()
        }
      }
    }
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    }
  })
}