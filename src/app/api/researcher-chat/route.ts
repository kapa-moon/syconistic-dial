import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { sessions } from "@/lib/schema"

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

  const { messages, score } = await req.json()
  const systemPrompt = buildSystemPrompt(session.alias, score)

  const stream = await client.messages.stream({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    thinking: {
      type: "enabled",
      budget_tokens: 5000,
    },
    system: systemPrompt,
    messages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      for await (const event of stream) {
        if (event.type === "content_block_delta") {
          if (event.delta.type === "thinking_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "thinking", text: event.delta.thinking })}\n\n`))
          } else if (event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`))
          }
        }
        if (event.type === "message_stop") {
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
