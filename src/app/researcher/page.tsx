"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { MarkdownText } from "@/lib/markdown"

// ─── Score metadata ───────────────────────────────────────────────────────────

type ScoreMeta = { label: string; hex: string; pillBg: string; pillBorder: string }

const SCORE_LABELS: Record<number, ScoreMeta> = {
  1: { label: "Antagonistic", hex: "#ff9100", pillBg: "bg-orange-50",  pillBorder: "border-orange-200" },
  2: { label: "Critical",     hex: "#ffb24d", pillBg: "bg-orange-50",  pillBorder: "border-orange-100" },
  3: { label: "Nuanced",      hex: "#ffd194", pillBg: "bg-amber-50",   pillBorder: "border-amber-100"  },
  4: { label: "Neutral",      hex: "#c8c8d0", pillBg: "bg-zinc-50",    pillBorder: "border-zinc-200"   },
  5: { label: "Supportive",   hex: "#94c5ff", pillBg: "bg-blue-50",    pillBorder: "border-blue-100"   },
  6: { label: "Agreeable",    hex: "#4da8ff", pillBg: "bg-blue-50",    pillBorder: "border-blue-200"   },
  7: { label: "Sycophantic",  hex: "#0080ff", pillBg: "bg-blue-100",   pillBorder: "border-blue-300"   },
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScoreResponse {
  text: string
  thinking: string
  done: boolean
}

interface Turn {
  question: string
  responses: Record<number, ScoreResponse>
  selectedScore: number | null
}

interface StoredTurn {
  question: string
  responses: Record<number, { text: string; thinking: string }>
}

interface StoredChat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  turns: StoredTurn[]
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

const STORAGE_KEY = "syconistic-researcher-chats"

function loadChats(): StoredChat[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredChat[]) : []
  } catch {
    return []
  }
}

function persistChats(chats: StoredChat[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(chats))
  } catch {
    // quota exceeded – silently ignore
  }
}

function storedToTurns(stored: StoredTurn[]): Turn[] {
  return stored.map((t) => ({
    question: t.question,
    responses: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => {
        const s = i + 1
        return [s, { text: t.responses[s]?.text ?? "", thinking: t.responses[s]?.thinking ?? "", done: true }]
      })
    ) as Record<number, ScoreResponse>,
    selectedScore: null,
  }))
}

function turnsToStored(turns: Turn[]): StoredTurn[] {
  return turns.map((t) => ({
    question: t.question,
    responses: Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => {
        const s = i + 1
        return [s, { text: t.responses[s]?.text ?? "", thinking: t.responses[s]?.thinking ?? "" }]
      })
    ) as Record<number, { text: string; thinking: string }>,
  }))
}

function formatDate(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Yesterday"
  if (diff < 7) return `${diff}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ResearcherView() {
  const [chats, setChats] = useState<StoredChat[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const prevLoadingRef = useRef(false)

  // Load stored chats on mount
  useEffect(() => {
    const saved = loadChats()
    setChats(saved)
    if (saved.length > 0) {
      setActiveChatId(saved[0].id)
      setTurns(storedToTurns(saved[0].turns))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-save to localStorage when a generation run completes
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && activeChatId && turns.length > 0) {
      saveTurns(activeChatId, turns)
    }
    prevLoadingRef.current = isLoading
  // `turns` and `activeChatId` intentionally omitted — we only want this on isLoading transitions
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [turns])

  // ── Persistence helpers ──────────────────────────────────────────────────

  function saveTurns(chatId: string, currentTurns: Turn[]) {
    setChats((prev) => {
      const updated = prev.map((c) =>
        c.id !== chatId
          ? c
          : { ...c, turns: turnsToStored(currentTurns), updatedAt: new Date().toISOString() }
      )
      persistChats(updated)
      return updated
    })
  }

  // ── Chat management ──────────────────────────────────────────────────────

  function startNewChat() {
    if (isLoading) return
    if (activeChatId && turns.length > 0) saveTurns(activeChatId, turns)

    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const newChat: StoredChat = { id, title: "New research session", createdAt: now, updatedAt: now, turns: [] }
    setChats((prev) => {
      const updated = [newChat, ...prev]
      persistChats(updated)
      return updated
    })
    setActiveChatId(id)
    setTurns([])
    setInput("")
  }

  function switchChat(chatId: string) {
    if (isLoading || chatId === activeChatId) return
    if (activeChatId && turns.length > 0) saveTurns(activeChatId, turns)
    const chat = chats.find((c) => c.id === chatId)
    if (!chat) return
    setActiveChatId(chatId)
    setTurns(storedToTurns(chat.turns))
    setInput("")
  }

  // ── Send handler ─────────────────────────────────────────────────────────

  async function handleSend() {
    if (!input.trim() || isLoading) return

    const question = input.trim()
    setInput("")
    setIsLoading(true)

    // Auto-create a chat if none is active
    let currentChatId = activeChatId
    if (!currentChatId) {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const newChat: StoredChat = { id, title: question.slice(0, 80), createdAt: now, updatedAt: now, turns: [] }
      currentChatId = id
      setActiveChatId(id)
      setChats((prev) => {
        const updated = [newChat, ...prev]
        persistChats(updated)
        return updated
      })
    } else {
      // Set title from first message
      setChats((prev) => {
        const chat = prev.find((c) => c.id === currentChatId)
        if (!chat || chat.turns.length > 0) return prev
        const updated = prev.map((c) =>
          c.id === currentChatId ? { ...c, title: question.slice(0, 80) } : c
        )
        persistChats(updated)
        return updated
      })
    }

    const newTurnIndex = turns.length
    const emptyResponses: Record<number, ScoreResponse> = {}
    for (let s = 1; s <= 7; s++) emptyResponses[s] = { text: "", thinking: "", done: false }
    setTurns((prev) => [...prev, { question, responses: emptyResponses, selectedScore: null }])

    // Build conversation history: all previous turns use score-4 (Neutral) as the
    // canonical assistant response so context is coherent across follow-ups.
    const apiMessages: { role: "user" | "assistant"; content: string }[] = [
      ...turns.flatMap((t) => [
        { role: "user" as const, content: t.question },
        { role: "assistant" as const, content: t.responses[4]?.text || "" },
      ]),
      { role: "user" as const, content: question },
    ]

    const scorePromises = Array.from({ length: 7 }, (_, i) => {
      const score = i + 1
      return streamScore(
        score,
        apiMessages,
        (textChunk) => {
          setTurns((prev) => {
            const updated = [...prev]
            const turn = { ...updated[newTurnIndex], responses: { ...updated[newTurnIndex].responses } }
            turn.responses[score] = { ...turn.responses[score], text: turn.responses[score].text + textChunk }
            updated[newTurnIndex] = turn
            return updated
          })
        },
        (thinkingChunk) => {
          setTurns((prev) => {
            const updated = [...prev]
            const turn = { ...updated[newTurnIndex], responses: { ...updated[newTurnIndex].responses } }
            turn.responses[score] = { ...turn.responses[score], thinking: turn.responses[score].thinking + thinkingChunk }
            updated[newTurnIndex] = turn
            return updated
          })
        }
      ).then(() => {
        setTurns((prev) => {
          const updated = [...prev]
          const turn = { ...updated[newTurnIndex], responses: { ...updated[newTurnIndex].responses } }
          turn.responses[score] = { ...turn.responses[score], done: true }
          updated[newTurnIndex] = turn
          return updated
        })
      })
    })

    await Promise.all(scorePromises)
    setIsLoading(false)
  }

  async function streamScore(
    score: number,
    messages: { role: string; content: string }[],
    onText: (chunk: string) => void,
    onThinking: (chunk: string) => void
  ) {
    const res = await fetch("/api/researcher-chat", {
      method: "POST",
      body: JSON.stringify({ messages, score }),
      headers: { "Content-Type": "application/json" },
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value)
      for (const line of chunk.split("\n").filter((l) => l.startsWith("data: "))) {
        const data = JSON.parse(line.slice(6))
        if (data.type === "text") onText(data.text)
        else if (data.type === "thinking") onThinking(data.text)
      }
    }
  }

  function toggleSelectedScore(turnIndex: number, score: number) {
    setTurns((prev) => {
      const updated = [...prev]
      const turn = { ...updated[turnIndex] }
      turn.selectedScore = turn.selectedScore === score ? null : score
      updated[turnIndex] = turn
      return updated
    })
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-roboto">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-zinc-200 z-10">
        <button
          onClick={() => setSidebarOpen((p) => !p)}
          className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors text-zinc-500"
          title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
            <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
          </svg>
        </button>
        <span className="text-sm font-medium text-zinc-900">Syconistic Dial</span>  
        <button
          onClick={() => router.push("/dashboard")}
          className="text-xs text-zinc-600 border border-zinc-300 px-2.5 py-1 rounded-md bg-white hover:bg-zinc-50 transition-colors"
        >
          ← Back to User View
        </button>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div
          className={`flex flex-col bg-white border-r border-zinc-200 overflow-hidden transition-all duration-200 flex-shrink-0 ${
            sidebarOpen ? "w-64" : "w-0"
          }`}
        >
          <div className="p-3 border-b border-zinc-100">
            <button
              onClick={startNewChat}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-700 rounded-lg hover:bg-zinc-100 transition-colors"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1v11M1 6.5h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              New session
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {chats.length === 0 && (
              <p className="text-xs text-zinc-400 px-4 py-3">No sessions yet</p>
            )}
            {chats.map((chat) => (
              <button
                key={chat.id}
                onClick={() => switchChat(chat.id)}
                className={`w-full text-left px-3 py-2.5 mx-1 rounded-lg transition-colors ${
                  activeChatId === chat.id
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
                style={{ width: "calc(100% - 8px)" }}
              >
                <p className="text-xs font-medium truncate leading-snug">{chat.title}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(chat.updatedAt)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Main chat area */}
        <div className="flex flex-col flex-1 overflow-hidden min-w-0">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
            {turns.length === 0 && !isLoading && (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-zinc-400">Send a message to see all 7 response styles side by side…</p>
              </div>
            )}

            {turns.map((turn, turnIndex) => (
              <div key={turnIndex} className="space-y-4">
                {/* User message — right */}
                <div className="flex justify-end">
                  <div className="max-w-[60%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed bg-zinc-900 text-white">
                    {turn.question}
                  </div>
                </div>

                {/* AI responses carousel — left */}
                <div className="space-y-3">
                  <div
                    className="flex gap-3 overflow-x-auto pb-2"
                    style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
                  >
                    {Array.from({ length: 7 }, (_, i) => {
                      const score = i + 1
                      const resp = turn.responses[score]
                      const meta = SCORE_LABELS[score]
                      const isSelected = turn.selectedScore === score
                      const isThinking = resp && !resp.done && resp.thinking !== "" && resp.text === ""
                      const isStreaming = resp && !resp.done && resp.text !== ""
                      const isDone = resp?.done

                      return (
                        <div
                          key={score}
                          onClick={() => isDone && toggleSelectedScore(turnIndex, score)}
                          style={{ scrollSnapAlign: "start", minWidth: "240px", maxWidth: "240px" }}
                          className={`flex flex-col rounded-xl border p-3.5 flex-shrink-0 transition-all duration-150 ${
                            isSelected
                              ? "border-zinc-800 shadow-md bg-white"
                              : isDone
                              ? `${meta.pillBg} ${meta.pillBorder} cursor-pointer hover:shadow-sm`
                              : `${meta.pillBg} ${meta.pillBorder} cursor-default opacity-90`
                          }`}
                        >
                          {/* Card header */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{score}</span>
                              <span className="text-xs font-semibold" style={{ color: meta.hex }}>{meta.label}</span>
                            </div>
                            <span className={`text-[10px] ${isDone ? "text-zinc-300" : "text-amber-400"}`}>
                              {isDone
                                ? resp.thinking ? "💭 click" : "✓"
                                : isThinking ? "thinking…"
                                : isStreaming ? "writing…"
                                : "waiting…"}
                            </span>
                          </div>

                          {/* Card body */}
                          <div className="flex-1 overflow-y-auto h-36">
                            {isThinking && (
                              <div>
                                <p className="text-[10px] text-amber-500 font-medium mb-1.5 animate-pulse">Thinking…</p>
                                <p className="text-[11px] text-zinc-400 leading-relaxed whitespace-pre-wrap line-clamp-6">
                                  {resp.thinking}
                                </p>
                              </div>
                            )}
                            {(isStreaming || isDone) && resp.text && (
                              <MarkdownText content={resp.text} className="!text-xs text-zinc-700" />
                            )}
                            {isStreaming && (
                              <span className="inline-block w-1 h-3 bg-zinc-400 ml-0.5 animate-pulse" />
                            )}
                            {!isThinking && !isStreaming && !isDone && (
                              <div className="flex gap-1 pt-2">
                                <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                <span className="w-1.5 h-1.5 bg-zinc-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Thinking panel */}
                  {turn.selectedScore !== null && (() => {
                    const sel = turn.responses[turn.selectedScore]
                    const meta = SCORE_LABELS[turn.selectedScore]
                    if (!sel) return null
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2.5 border-b border-amber-200">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-amber-700">Thinking</span>
                            <span className="text-xs text-zinc-400">—</span>
                            <span className="text-xs font-semibold" style={{ color: meta.hex }}>{meta.label}</span>
                            <span className="text-[10px] font-mono text-zinc-400">({turn.selectedScore})</span>
                          </div>
                          <button
                            onClick={() => toggleSelectedScore(turnIndex, turn.selectedScore!)}
                            className="text-xs text-amber-400 hover:text-amber-600 transition-colors px-1"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="px-4 py-3 max-h-56 overflow-y-auto">
                          {sel.thinking ? (
                            <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{sel.thinking}</p>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">No thinking captured for this response.</p>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            ))}

            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="px-6 py-4 bg-white border-t border-zinc-200">
            <div className="flex gap-2">
              <textarea
                className="flex-1 resize-none border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 leading-relaxed"
                placeholder="Type a message to see all 7 sycophancy levels simultaneously…"
                rows={2}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                  }
                }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="px-4 py-2 bg-zinc-900 text-white text-sm rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-40"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
