import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import OpenAI from "openai"
import { db } from "@/lib/db"
import { sessions, conversations, messages, participants, mentalModels } from "@/lib/schema"

const deployment = "gpt-4o"

const openai = new OpenAI()

// ─── Main chat system prompt ──────────────────────────────────────────────────

function buildSystemPrompt(alias: string, memory?: string | null): string {
  const memoryBlock = memory
    ? `\n\nWhat you know about ${alias} from previous conversations:\n${memory}`
    : ""
  return `You are a helpful, honest AI assistant having a conversation with ${alias}. Be clear, thoughtful, and balanced. Adapt your tone to what the conversation calls for.${memoryBlock}`
}

// ─── Prior mental model helpers ───────────────────────────────────────────────

function stripExplanations(obj: unknown): unknown {
  if (obj === null || typeof obj !== "object") return obj
  if (Array.isArray(obj)) return (obj as unknown[]).map(stripExplanations)
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (k === "explanation") continue
    out[k] = stripExplanations(v)
  }
  return out
}

function formatPriorMentalModel(mm: unknown): string {
  if (!mm) return ""
  try { return JSON.stringify(stripExplanations(mm), null, 2) } catch { return "" }
}

type TurnWithPrior = {
  userMessage: string
  assistantMessage: string
  inductPrior?: unknown
  typesSupportPrior?: unknown
  inductUserPrior?: unknown      // user-adjusted induct scores for this turn
  typesSupportUserPrior?: unknown // user-adjusted types-support scores for this turn
}

type CombinedMentalModelPayload = {
  induct?: unknown
  typesSupport?: unknown
  inductUser?: unknown
  typesSupportUser?: unknown
}

function buildHistoryBlock(
  turns: TurnWithPrior[],
  key: "inductPrior" | "typesSupportPrior",
  userKey: "inductUserPrior" | "typesSupportUserPrior",
  alias: string
): string {
  if (!turns.length) return "(no previous conversation)"
  return turns.map((t) => {
    let block = `User: ${t.userMessage}\n\nAssistant: ${t.assistantMessage}`
    const prior = t[key]
    if (prior) {
      const json = formatPriorMentalModel(prior)
      if (json) block += `\n\nAI's mental model at end of this turn (inferred scores only):\n\`\`\`json\n${json}\n\`\`\``
    }
    const userPrior = t[userKey]
    if (userPrior) {
      const userJson = formatPriorMentalModel(userPrior)
      if (userJson) block += `\n\n${alias}'s self-assessment at end of this turn (treat as additional signal, form your own independent estimate):\n\`\`\`json\n${userJson}\n\`\`\``
    }
    return block
  }).join("\n\n")
}

// ─── Induct prompt (matches perception-llm SUFFIX_INDUCT) ────────────────────

function buildInductPrompt(turns: TurnWithPrior[], newUserText: string, alias: string): string {
  const hasPriors = turns.some((t) => t.inductPrior)
  const history = buildHistoryBlock(turns, "inductPrior", "inductUserPrior", alias)
  const updateLine = hasPriors ? "\n\nUpdate your mental model for the current turn.\n\n" : "\n\n"

  return `You are an AI assistant having a conversation with a human (${alias}).

Conversation so far:
"""${history}"""

${alias} now says:
"""${newUserText}"""
${updateLine}First, output your mental model of ${alias}. Estimate structured beliefs about ${alias} along the following dimensions:

1. Belief about how much ${alias} is seeking validation/support.
2. Belief about how right ${alias} is in the situation.
3. Belief about whether ${alias} has more information than you (the model).
4. Belief about whether ${alias} is seeking an objective perspective.

Treat these as *probabilistic beliefs* that may co-exist. These dimensions are independent and do NOT need to sum to 1. Each score should be between 0 and 1.

Then output ONLY a valid JSON object in the following structure:

{
  "mental_model": {
    "beliefs": {
      "validation_seeking": {
        "score": 0.0,
        "explanation": ""
      },
      "user_rightness": {
        "score": 0.0,
        "explanation": ""
      },
      "user_information_advantage": {
        "score": 0.0,
        "explanation": ""
      },
      "objectivity_seeking": {
        "score": 0.0,
        "explanation": ""
      }
    }
  }
}`
}

// ─── Types support prompt (matches perception-llm SUFFIX_TYPES_SUPPORT) ───────

function buildTypesSupportPrompt(turns: TurnWithPrior[], newUserText: string, alias: string): string {
  const hasPriors = turns.some((t) => t.typesSupportPrior)
  const history = buildHistoryBlock(turns, "typesSupportPrior", "typesSupportUserPrior", alias)
  const updateLine = hasPriors ? "\n\nUpdate your mental model for the current turn.\n\n" : "\n\n"

  return `You are an AI assistant having a conversation with a human (${alias}).

Conversation so far:
"""${history}"""

${alias} now says:
"""${newUserText}"""
${updateLine}First, output your mental model of ${alias}. Estimate structured beliefs about the extent to which ${alias} is seeking different types of support:

1. **Emotional Support** - Seeking opportunities for confiding, sympathetic listening, or caring behaviors:
   - Confiding/listening: seeking empathetic understanding or wanting someone to listen to private feelings or problems
   - Affection: seeking expressions of love, care, or emotional closeness
   - Esteem support: seeking validation of self-worth, acceptance despite difficulties
   - Being there: seeking unconditional availability or presence
   - Comforting touch: seeking physical comfort or affection

2. **Social Contact and Companionship** - Seeking positive social interaction:
   - Companionship: wanting to spend time with others, do activities together
   - Positive interaction: seeking to joke, talk about interests, engage in diversionary activities
   - Shared activities: wanting to do fun things with others

3. **Belonging Support** - Seeking connection to a group or community:
   - Social integration: wanting to feel part of a group with common interests
   - Group inclusion: seeking comfort, security, or identity through group membership
   - Sense of belonging: wanting to feel included and connected

4. **Information and Guidance Support** - Seeking knowledge, advice, or problem-solving help:
   - Advice/guidance: seeking solutions, feedback, or direction
   - Information: seeking facts, explanations, or understanding of situations
   - Cognitive guidance: seeking help in defining or coping with problems

5. **Tangible Support** - Seeking practical or instrumental assistance:
   - Material aid: seeking financial help, resources, or physical objects
   - Practical assistance: seeking help with tasks, chores, or concrete actions
   - Reliable alliance: seeking assurance that others will provide tangible help

Treat these as *probabilistic beliefs* that may co-exist. These dimensions are independent and do NOT need to sum to 1. Each score should be between 0 and 1.

Then output ONLY a valid JSON object in the following structure:

{
  "mental_model": {
    "support_seeking": {
      "emotional_support": {
        "score": 0.0,
        "explanation": ""
      },
      "social_companionship": {
        "score": 0.0,
        "explanation": ""
      },
      "belonging_support": {
        "score": 0.0,
        "explanation": ""
      },
      "information_guidance": {
        "score": 0.0,
        "explanation": ""
      },
      "tangible_support": {
        "score": 0.0,
        "explanation": ""
      }
    }
  }
}`
}

// ─── Inference helpers ────────────────────────────────────────────────────────

// Extract the first well-formed JSON object by tracking brace depth,
// avoiding the greedy-regex pitfall where explanations with braces cause mismatches.
function extractFirstJson(raw: string): unknown | null {
  const start = raw.indexOf("{")
  if (start === -1) return null
  let depth = 0
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++
    else if (raw[i] === "}") {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(raw.slice(start, i + 1))
        } catch {
          break
        }
      }
    }
  }
  return null
}

async function inferInductMentalModel(turns: TurnWithPrior[], newUserText: string, alias: string): Promise<unknown> {
  try {
    const res = await openai.chat.completions.create({
      model: deployment,
      max_tokens: 5000,
      temperature: 0.7,
      top_p: 0.9,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildInductPrompt(turns, newUserText, alias) }],
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? ""
    return extractFirstJson(raw)
  } catch (e) {
    console.error("[intervention-chat] induct inference error:", e)
    return null
  }
}

async function inferTypesSupportMentalModel(turns: TurnWithPrior[], newUserText: string, alias: string): Promise<unknown> {
  try {
    const res = await openai.chat.completions.create({
      model: deployment,
      max_tokens: 5000,
      temperature: 0.7,
      top_p: 0.9,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: buildTypesSupportPrompt(turns, newUserText, alias) }],
    })
    const raw = res.choices[0]?.message?.content?.trim() ?? ""
    return extractFirstJson(raw)
  } catch (e) {
    console.error("[intervention-chat] types_support inference error:", e)
    return null
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

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

  const { messages: chatMessages, conversationId, priorMentalModels, userAdjustedMentalModels } = await req.json()

  const participant = await db.query.participants.findFirst({
    where: eq(participants.id, participantId),
  })

  const systemPrompt = buildSystemPrompt(session.alias, participant?.memory)

  const apiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...chatMessages.map(({ role, content }: { role: string; content: string }) => ({
      role: role as "user" | "assistant",
      content,
    })),
  ]

  // Persist incoming user message
  if (conversationId) {
    const lastMsg = chatMessages[chatMessages.length - 1]
    if (lastMsg?.role === "user") {
      await db.insert(messages).values({ conversationId, role: "user", content: lastMsg.content })
    }
  }

  // Pair completed turns with their prior mental models for context-aware inference
  const completedMessages = chatMessages.slice(0, -1) // all but the current user message
  const mmPriors: CombinedMentalModelPayload[] = Array.isArray(priorMentalModels) ? priorMentalModels : []
  const userPriors: CombinedMentalModelPayload[] = Array.isArray(userAdjustedMentalModels) ? userAdjustedMentalModels : []
  const turnPairs: TurnWithPrior[] = []

  for (let i = 0; i < completedMessages.length - 1; i++) {
    if (completedMessages[i].role === "user" && completedMessages[i + 1]?.role === "assistant") {
      const idx = turnPairs.length
      const prior = mmPriors[idx] ?? null
      const userPrior = userPriors[idx] ?? null
      turnPairs.push({
        userMessage: completedMessages[i].content,
        assistantMessage: completedMessages[i + 1].content,
        inductPrior: prior?.induct ?? null,
        typesSupportPrior: prior?.typesSupport ?? null,
        inductUserPrior: userPrior?.inductUser ?? null,
        typesSupportUserPrior: userPrior?.typesSupportUser ?? null,
      })
      i++
    }
  }

  const lastUserMsg = chatMessages[chatMessages.length - 1]

  // Fire main response stream and both mental model inferences in parallel
  const inductPromise = inferInductMentalModel(turnPairs, lastUserMsg?.content ?? "", session.alias)
  const typesSupportPromise = inferTypesSupportMentalModel(turnPairs, lastUserMsg?.content ?? "", session.alias)

  const stream = await openai.chat.completions.create({
    model: deployment,
    stream: true,
    max_tokens: 5000,
    temperature: 0.7,
    top_p: 0.9,
    messages: apiMessages,
  })

  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      let accText = ""
      try {
        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ""
          if (text) {
            accText += text
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "text", text })}\n\n`))
          }
        }

        // Persist assistant response
        try {
          if (conversationId && accText) {
            await db.insert(messages).values({ conversationId, role: "assistant", content: accText, sycophancyScore: null })
            await db.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId))
          }
        } catch (dbErr) {
          console.error("[intervention-chat] db persist error:", dbErr)
        }

        // Await mental models (already running in parallel — usually resolved by now)
        try {
          const [mmInduct, mmTypesSupport] = await Promise.all([inductPromise, typesSupportPromise])
          if (mmInduct || mmTypesSupport) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "mental_model", data: { induct: mmInduct, typesSupport: mmTypesSupport } })}\n\n`))
            // Persist to database
            if (conversationId) {
              const currentTurnIndex = turnPairs.length
              await db.insert(mentalModels).values({
                conversationId,
                turnIndex: currentTurnIndex,
                inductData: mmInduct ?? null,
                typesSupportData: mmTypesSupport ?? null,
              }).onConflictDoNothing()
            }
          }
        } catch (mmErr) {
          console.error("[intervention-chat] mental model await error:", mmErr)
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`))
        controller.close()
      } catch (streamErr) {
        console.error("[intervention-chat] stream error:", streamErr)
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
