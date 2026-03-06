"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { MarkdownText } from "@/lib/markdown"
import { FeedbackWidget } from "@/components/FeedbackWidget"

interface Message {
  role: "user" | "assistant"
  content: string
  thinking?: string | null
  createdAt?: string | null
  sycophancyScore?: number | null
  thinkingId?: number
}

interface ThinkingBlock {
  id: number
  thinking: string
  responsePreview: string
}

interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

const LEVEL_COLORS: Record<number, string> = {
  1: "#ff9100",
  2: "#ffb24d",
  3: "#ffd194",
  4: "#c8c8d0",
  5: "#94c5ff",
  6: "#4da8ff",
  7: "#0080ff",
}

function getSliderColor(s: number): string {
  return LEVEL_COLORS[s] ?? "#c8c8d0"
}

function SycophancySlider({ score, onChange }: { score: number; onChange: (v: number) => void }) {
  const trackRef = useRef<HTMLDivElement>(null)

  function getScoreFromPointer(clientX: number): number {
    const track = trackRef.current
    if (!track) return score
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * 6) + 1
  }

  const percent = ((score - 1) / 6) * 100
  const color = getSliderColor(score)

  return (
    <div className="relative w-full py-3">
      <div
        ref={trackRef}
        className="relative w-full cursor-pointer"
        style={{ height: "44px" }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(getScoreFromPointer(e.clientX))
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0) return
          onChange(getScoreFromPointer(e.clientX))
        }}
      >
        {/* Track line */}
        <div className="absolute left-0 right-0 top-1/2 h-[3px] bg-zinc-200 rounded-full -translate-y-1/2" />

        {/* Tick marks */}
        {[1, 2, 3, 4, 5, 6, 7].map((level) => (
          <div
            key={level}
            className="absolute top-1/2 w-[3px] h-[3px] rounded-full bg-zinc-400"
            style={{
              left: `${((level - 1) / 6) * 100}%`,
              transform: "translate(-50%, -50%)",
            }}
          />
        ))}

        {/* Square thumb */}
        <div
          className="absolute top-1/2 flex items-center justify-center select-none"
          style={{
            left: `${percent}%`,
            transform: "translate(-50%, -50%)",
            width: "34px",
            height: "34px",
            borderRadius: "6px",
            border: `2.5px solid ${color}`,
            backgroundColor: "white",
            fontWeight: 700,
            fontSize: "15px",
            color: color,
            cursor: "grab",
            boxShadow: "0 1px 5px rgba(0,0,0,0.13)",
            pointerEvents: "none",
            transition: "border-color 0.15s, color 0.15s",
          }}
        >
          {score}
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [alias, setAlias] = useState("")
  const [score, setScore] = useState(4)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [streamingThinking, setStreamingThinking] = useState("")
  const [thinkingBlocks, setThinkingBlocks] = useState<ThinkingBlock[]>([])
  const [thinkingCounter, setThinkingCounter] = useState(0)
  const [fullThinking] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [lastFeedbackAt, setLastFeedbackAt] = useState(0)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const thinkingEndRef = useRef<HTMLDivElement>(null)
  const thinkingBlockRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const [highlightedThinkingId, setHighlightedThinkingId] = useState<number | null>(null)
  const router = useRouter()

  function scrollToThinking(thinkingId: number) {
    const el = thinkingBlockRefs.current.get(thinkingId)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" })
      setHighlightedThinkingId(thinkingId)
      setTimeout(() => setHighlightedThinkingId(null), 1400)
    }
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/session").then((r) => r.json()),
      fetch("/api/conversations").then((r) => r.json()),
    ]).then(([sessionData, convsData]) => {
      setAlias(sessionData.alias)
      setScore(sessionData.sycophancyScore ?? 4)
      const convs: Conversation[] = convsData.conversations ?? []
      setConversations(convs)
      if (convs.length > 0) {
        loadConversationMessages(convs[0].id)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingText])

  useEffect(() => {
    thinkingEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [streamingThinking])

  async function loadConversationMessages(conversationId: string) {
    setLoadingConversation(true)
    setActiveConversationId(conversationId)
    setStreamingText("")
    setStreamingThinking("")
    const res = await fetch(`/api/conversations/${conversationId}/messages`)
    const data = await res.json()
    const rawMessages: Message[] = data.messages ?? []

    // Rebuild thinking blocks from stored thinking and assign thinkingIds
    const rebuiltBlocks: ThinkingBlock[] = []
    let tidCounter = 0
    const messagesWithIds = rawMessages.map((m) => {
      if (m.role === "assistant" && m.thinking) {
        const tid = tidCounter++
        rebuiltBlocks.push({
          id: tid,
          thinking: m.thinking,
          responsePreview: m.content.slice(0, 60) + "...",
        })
        return { ...m, thinkingId: tid }
      }
      return m
    })

    setMessages(messagesWithIds)
    setThinkingBlocks(rebuiltBlocks)
    setThinkingCounter(tidCounter)
    setLastFeedbackAt(messagesWithIds.filter((m) => m.role === "assistant").length)
    setLoadingConversation(false)
  }

  function startNewChat() {
    setActiveConversationId(null)
    setMessages([])
    setThinkingBlocks([])
    setStreamingText("")
    setStreamingThinking("")
    setInput("")
    setLastFeedbackAt(0)
  }

  async function handleScoreChange(newScore: number) {
    setScore(newScore)
    await fetch("/api/session", {
      method: "PATCH",
      body: JSON.stringify({ sycophancyScore: newScore }),
      headers: { "Content-Type": "application/json" },
    })
  }

  async function handleAliasUpdate(newAlias: string) {
    const trimmed = newAlias.trim()
    setAlias(trimmed)
    if (!trimmed) return
    await fetch("/api/session", {
      method: "PATCH",
      body: JSON.stringify({ alias: trimmed }),
      headers: { "Content-Type": "application/json" },
    })
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return

    let conversationId = activeConversationId

    // Auto-create a conversation on the first message
    if (!conversationId) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: input.trim().slice(0, 80) }),
      })
      const newConv: Conversation = await res.json()
      conversationId = newConv.id
      setActiveConversationId(conversationId)
      setConversations((prev) => [newConv, ...prev])
    }

    const userMessage: Message = { role: "user", content: input }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setInput("")
    setIsLoading(true)
    setStreamingText("")
    setStreamingThinking("")

    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify({ messages: newMessages, fullThinking, conversationId }),
      headers: { "Content-Type": "application/json" },
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let accText = ""
    let accThinking = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value)
      const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))

      for (const line of lines) {
        const data = JSON.parse(line.slice(6))

        if (data.type === "thinking") {
          accThinking += data.text
          setStreamingThinking(accThinking)
        } else if (data.type === "text") {
          accText += data.text
          setStreamingText(accText)
        } else if (data.type === "done") {
          const assignedThinkingId = thinkingCounter
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: accText,
              thinking: accThinking || null,
              createdAt: new Date().toISOString(),
              sycophancyScore: score,
              thinkingId: assignedThinkingId,
            },
          ])
          setStreamingText("")
          setStreamingThinking("")
          setThinkingBlocks((prev) => [
            ...prev,
            {
              id: thinkingCounter,
              thinking: accThinking,
              responsePreview: accText.slice(0, 60) + "...",
            },
          ])
          setThinkingCounter((prev) => prev + 1)
          setIsLoading(false)
          // Bubble the active conversation to top of sidebar
          if (conversationId) {
            const now = new Date().toISOString()
            setConversations((prev) => {
              const updated = prev.map((c) =>
                c.id === conversationId ? { ...c, updatedAt: now } : c
              )
              return [
                updated.find((c) => c.id === conversationId)!,
                ...updated.filter((c) => c.id !== conversationId),
              ]
            })
          }
        }
      }
    }
  }

  async function handleFeedbackSubmit(feelingScore: number, helpfulnessScore: number) {
    const assistantCount = messages.filter((m) => m.role === "assistant").length
    setLastFeedbackAt(assistantCount)
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feelingScore, helpfulnessScore, conversationId: activeConversationId }),
    })
  }

  function getSliderLabel(val: number) {
    if (val === 1) return "Antagonistic"
    if (val === 2) return "Critical"
    if (val === 3) return "Nuanced"
    if (val === 4) return "Neutral"
    if (val === 5) return "Supportive"
    if (val === 6) return "Agreeable"
    return "Sycophantic"
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-roboto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-200 z-10">
        <div className="flex items-center gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen((prev) => !prev)}
            className="p-1.5 rounded-md hover:bg-zinc-100 transition-colors text-zinc-500"
            title={sidebarOpen ? "Hide chats" : "Show chats"}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="3" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="7.25" width="14" height="1.5" rx="0.75" fill="currentColor" />
              <rect x="1" y="11.5" width="14" height="1.5" rx="0.75" fill="currentColor" />
            </svg>
          </button>
          <span className="text-sm font-medium text-zinc-900">Syconistic Dial</span>
          <button
            onClick={() => router.push("/researcher")}
            className="text-xs text-zinc-600 border border-zinc-300 px-2.5 py-1 rounded-md bg-white hover:bg-zinc-50 transition-colors"
          >
            Researcher View
          </button>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            className="px-3 py-1.5 text-xs border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-zinc-900 outline-none"
            placeholder="How should I call you?"
            value={alias}
            onChange={(e) => setAlias(e.target.value)}
            onBlur={(e) => handleAliasUpdate(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleAliasUpdate(alias)
              }
            }}
          />
          <button
            onClick={async () => {
              await fetch("/api/logout", { method: "POST" })
              router.push("/login")
            }}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main layout */}
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
              New chat
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {conversations.length === 0 && (
              <p className="text-xs text-zinc-400 px-4 py-3">No conversations yet</p>
            )}
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => loadConversationMessages(conv.id)}
                className={`w-full text-left px-3 py-2.5 mx-1 rounded-lg transition-colors group ${
                  activeConversationId === conv.id
                    ? "bg-zinc-100 text-zinc-900"
                    : "text-zinc-600 hover:bg-zinc-50"
                }`}
                style={{ width: "calc(100% - 8px)" }}
              >
                <p className="text-xs font-medium truncate leading-snug">{conv.title}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(conv.updatedAt)}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Chat + Right panel */}
        <div className="flex flex-1 overflow-hidden min-w-0">

          {/* Chat */}
          <div className="flex flex-col flex-1 border-r border-zinc-200 min-w-0">
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {loadingConversation ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-zinc-400">Loading...</p>
                </div>
              ) : messages.length === 0 && !streamingText ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-zinc-400">Start a conversation...</p>
                </div>
              ) : null}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "user" ? (
                    <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-zinc-900 text-white text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[80%] flex flex-col gap-1">
                      <div
                        className={`px-4 py-2.5 rounded-2xl bg-white text-zinc-800 transition-shadow duration-200 ${msg.thinkingId != null ? "cursor-pointer hover:shadow-md" : ""}`}
                        style={{
                          border: `1.5px solid ${msg.sycophancyScore ? getSliderColor(msg.sycophancyScore) : "#c8c8d0"}`,
                        }}
                        onClick={() => msg.thinkingId != null && scrollToThinking(msg.thinkingId)}
                        title={msg.thinkingId != null ? "Click to see thinking process" : undefined}
                      >
                        <MarkdownText content={msg.content} />
                      </div>
                      {msg.createdAt && (
                        <span
                          className="text-[10px] px-1"
                          style={{ color: msg.sycophancyScore ? getSliderColor(msg.sycophancyScore) : "#c8c8d0" }}
                        >
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                          {msg.sycophancyScore != null && ` · Level ${msg.sycophancyScore}`}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {streamingText && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-white border border-zinc-200 text-zinc-800">
                    <MarkdownText content={streamingText} />
                    <span className="inline-block w-1 h-3 bg-zinc-400 ml-0.5 animate-pulse" />
                  </div>
                </div>
              )}
              {isLoading && !streamingText && (
                <div className="flex justify-start">
                  <div className="px-4 py-2.5 rounded-2xl bg-white border border-zinc-200">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              {(() => {
                const assistantCount = messages.filter((m) => m.role === "assistant").length
                return assistantCount > 0 && assistantCount % 3 === 0 && assistantCount > lastFeedbackAt && !isLoading
              })() && (
                <FeedbackWidget key={messages.filter((m) => m.role === "assistant").length} onSubmit={handleFeedbackSubmit} />
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 bg-white border-t border-zinc-200">
              <div className="flex gap-2">
                <textarea
                  className="flex-1 resize-none border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 leading-relaxed"
                  placeholder="Type a message..."
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

          {/* Right panel */}
          <div className="flex flex-col w-[380px] flex-shrink-0 overflow-hidden">

            {/* Sycophancy slider */}
            <div className="px-6 py-5 bg-white border-b border-zinc-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Response Style</span>
                <span className="text-xs font-semibold text-zinc-900">{getSliderLabel(score)}</span>
              </div>
              <SycophancySlider score={score} onChange={handleScoreChange} />
              <div className="flex justify-between -mt-1">
                <span className="text-xs text-zinc-400">Antagonistic</span>
                <span className="text-xs text-zinc-400">Sycophantic</span>
              </div>
            </div>

            {/* Thinking mode */}
            <div className="px-6 py-3 bg-white border-b border-zinc-200 flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Thinking Mode</span>
                <span className="text-xs text-zinc-400 mt-0.5">
                  {fullThinking ? "Full — claude-sonnet-3-7" : "Reasoning Summary — claude-sonnet-4-6"}
                </span>
              </div>
            </div>

            {/* Thinking process */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Thinking Process</span>

              {thinkingBlocks.length === 0 && !streamingThinking && (
                <p className="text-xs text-zinc-400 mt-2">Thinking will appear here...</p>
              )}

              {thinkingBlocks.map((block) => (
                <div
                  key={block.id}
                  ref={(el) => {
                    if (el) thinkingBlockRefs.current.set(block.id, el)
                    else thinkingBlockRefs.current.delete(block.id)
                  }}
                  className={`rounded-xl p-4 mt-3 border transition-colors duration-300 ${
                    highlightedThinkingId === block.id
                      ? "bg-amber-50 border-amber-300"
                      : "bg-zinc-50 border-zinc-200"
                  }`}
                >
                  <p className="text-xs text-zinc-400 mb-2 italic">Re: &ldquo;{block.responsePreview}&rdquo;</p>
                  <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{block.thinking}</p>
                </div>
              ))}

              {streamingThinking && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mt-3">
                  <p className="text-xs text-amber-500 mb-2 font-medium">Thinking...</p>
                  <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">{streamingThinking}</p>
                  <span className="inline-block w-1 h-3 bg-amber-400 ml-0.5 animate-pulse" />
                </div>
              )}
              <div ref={thinkingEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
