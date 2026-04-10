"use client"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { MarkdownText } from "@/lib/markdown"
import { FeedbackWidget } from "@/components/FeedbackWidget"
import { buildLoginRedirect } from "@/lib/auth"

type ScoreMeta = { label: string; hex: string; pillBg: string; pillBorder: string }

const SCORE_LABELS: Record<number, ScoreMeta> = {
  1: { label: "Antagonistic", hex: "#ff7e21", pillBg: "bg-orange-50",  pillBorder: "border-orange-200" },
  2: { label: "Critical",     hex: "#ffb24d", pillBg: "bg-orange-50",  pillBorder: "border-orange-100" },
  3: { label: "Neutral",      hex: "#8e8e9a", pillBg: "bg-zinc-50",    pillBorder: "border-zinc-200"   },
  4: { label: "Agreeable",    hex: "#4da8ff", pillBg: "bg-blue-50",    pillBorder: "border-blue-200"   },
  5: { label: "Sycophantic",  hex: "#006eff", pillBg: "bg-blue-100",   pillBorder: "border-blue-300"   },
}

interface Message {
  role: "user" | "assistant"
  content: string
  thinking?: string | null
  createdAt?: string | null
  sycophancyScore?: number | null
}

interface ExplorationResponse {
  text: string
  done: boolean
}

interface ExplorationTurn {
  question: string
  canonicalScore: number
  responses: Record<number, ExplorationResponse>
  flippedScore: number | null
}

interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  sycophancyScore?: number | null
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
  1: "#ff7e21",
  2: "#ffb24d",
  3: "#8e8e9a",
  4: "#4da8ff",
  5: "#006eff",
}

function getSliderColor(s: number): string {
  return LEVEL_COLORS[s] ?? "#8e8e9a"
}

function parseChatTitle(title: string): { base: string; continuation: string | null } {
  const match = title.match(/^(.*?)\s*(\(continued(?:\s*-\s*part\s*\d+)?\))$/i)
  if (match) return { base: match[1].trim(), continuation: match[2] }
  return { base: title, continuation: null }
}

function getForkTitle(sourceTitle: string): string {
  const match = sourceTitle.match(/^(.*?)\s*\(continued(?:\s*-\s*part\s*(\d+))?\)$/i)
  if (match) {
    const base = match[1].trim()
    const part = match[2] ? parseInt(match[2]) + 1 : 3
    return `${base} (continued - part ${part})`
  }
  return `${sourceTitle} (continued - part 2)`
}

function SycophancySlider({ score, onChange, disabled }: { score: number; onChange: (v: number) => void; disabled?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null)

  function getScoreFromPointer(clientX: number): number {
    const track = trackRef.current
    if (!track) return score
    const rect = track.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(ratio * 4) + 1
  }

  const percent = ((score - 1) / 4) * 100
  const color = disabled ? "#c0c0c8" : getSliderColor(score)

  return (
    <div className={`relative w-full py-3 ${disabled ? "opacity-50" : ""}`}>
      <div
        ref={trackRef}
        className={`relative w-full ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        style={{ height: "44px" }}
        onPointerDown={(e) => {
          if (disabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          onChange(getScoreFromPointer(e.clientX))
        }}
        onPointerMove={(e) => {
          if (disabled || e.buttons === 0) return
          onChange(getScoreFromPointer(e.clientX))
        }}
      >
        <div className="absolute left-0 right-0 top-1/2 h-[3px] bg-zinc-200 rounded-full -translate-y-1/2" />
        {[1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            className="absolute top-1/2 w-[3px] h-[3px] rounded-full bg-zinc-400"
            style={{ left: `${((level - 1) / 4) * 100}%`, transform: "translate(-50%, -50%)" }}
          />
        ))}
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
            cursor: disabled ? "not-allowed" : "grab",
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

export default function ChatDefault() {
  const [alias, setAlias] = useState("")
  const [score, setScore] = useState(3)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [lastFeedbackAt, setLastFeedbackAt] = useState(0)
  const [aliasTooltipDismissed, setAliasTooltipDismissed] = useState(false)
  const [aliasFocused, setAliasFocused] = useState(false)
  const [scoreTooltipDismissed, setScoreTooltipDismissed] = useState(false)
  const [scoreManuallySet, setScoreManuallySet] = useState(false)
  const [sliderLocked, setSliderLocked] = useState(false)
  const [conversationScores, setConversationScores] = useState<Record<string, number>>({})
  const [explorationTurns, setExplorationTurns] = useState<ExplorationTurn[]>([])
  const [isNewChat, setIsNewChat] = useState(false)
  const [explorationConfirmed, setExplorationConfirmed] = useState(false)

  const aliasInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    Promise.all([
      fetch("/api/session"),
      fetch("/api/conversations").then((r) => r.json()),
    ]).then(async ([sessionRes, convsData]) => {
      if (!sessionRes.ok) {
        router.replace(buildLoginRedirect("/chat-default"))
        return
      }
      const sessionData = await sessionRes.json()
      setAlias(sessionData.alias)
      setScore(sessionData.sycophancyScore ?? 4)
      const convs: Conversation[] = convsData.conversations ?? []
      setConversations(convs)
      const scores: Record<string, number> = {}
      for (const c of convs) {
        if (c.sycophancyScore != null) scores[c.id] = c.sycophancyScore
      }
      setConversationScores(scores)
      if (convs.length > 0) {
        loadConversationMessages(convs[0].id)
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingText])

  async function loadConversationMessages(conversationId: string) {
    if (activeConversationId && activeConversationId !== conversationId && messages.some((m) => m.role === "assistant")) {
      triggerSummarize(activeConversationId)
    }
    setLoadingConversation(true)
    setActiveConversationId(conversationId)
    setStreamingText("")
    const res = await fetch(`/api/conversations/${conversationId}/messages`)
    const data = await res.json()
    const rawMessages: Message[] = data.messages ?? []

    setMessages(rawMessages)
    setLastFeedbackAt(rawMessages.filter((m) => m.role === "assistant").length)
    setLoadingConversation(false)
    setExplorationTurns([])
    setIsNewChat(false)
    setExplorationConfirmed(false)

    const hasMessages = rawMessages.length > 0
    setSliderLocked(hasMessages)
    if (hasMessages) {
      const firstAssistant = rawMessages.find((m) => m.role === "assistant" && m.sycophancyScore != null)
      if (firstAssistant?.sycophancyScore) {
        setScore(firstAssistant.sycophancyScore)
        setConversationScores((prev) => ({ ...prev, [conversationId]: firstAssistant.sycophancyScore! }))
      }
    }
  }

  function triggerSummarize(conversationId: string) {
    fetch(`/api/conversations/${conversationId}/summarize`, { method: "POST" }).catch(() => {})
  }

  function startNewChat() {
    if (activeConversationId && (messages.some((m) => m.role === "assistant") || explorationTurns.length > 0)) {
      triggerSummarize(activeConversationId)
    }
    setActiveConversationId(null)
    setMessages([])
    setStreamingText("")
    setInput("")
    setLastFeedbackAt(0)
    setSliderLocked(false)
    setExplorationTurns([])
    setIsNewChat(true)
    setExplorationConfirmed(false)
  }

  async function handleScoreChange(newScore: number) {
    setScore(newScore)
    setScoreManuallySet(true)
    await fetch("/api/session", {
      method: "PATCH",
      body: JSON.stringify({ sycophancyScore: newScore }),
      headers: { "Content-Type": "application/json" },
    })
  }

  async function forkConversation() {
    if (isLoading) return

    if (activeConversationId) triggerSummarize(activeConversationId)

    const strippedMessages: Message[] = messages.map((m) => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      sycophancyScore: m.sycophancyScore,
      thinking: null,
    }))

    const sourceTitle = conversations.find((c) => c.id === activeConversationId)?.title ?? "Conversation"
    const res = await fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: getForkTitle(sourceTitle) }),
    })
    const newConv: Conversation = await res.json()

    setConversations((prev) => [newConv, ...prev])
    setActiveConversationId(newConv.id)
    setMessages(strippedMessages)
    setStreamingText("")
    setInput("")
    setLastFeedbackAt(strippedMessages.filter((m) => m.role === "assistant").length)
    setSliderLocked(false)
    setExplorationTurns([])
    setIsNewChat(false)
    setExplorationConfirmed(false)
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

  async function streamScore(
    s: number,
    apiMessages: { role: string; content: string }[],
    onText: (chunk: string) => void
  ) {
    const res = await fetch("/api/explore-chat", {
      method: "POST",
      body: JSON.stringify({ messages: apiMessages, score: s }),
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
      }
    }
  }

  function toggleExplorationFlip(turnIndex: number, s: number) {
    setExplorationTurns((prev) => {
      const updated = [...prev]
      const turn = { ...updated[turnIndex] }
      turn.flippedScore = turn.flippedScore === s ? null : s
      updated[turnIndex] = turn
      return updated
    })
  }

  async function chooseExplorationLevel(s: number, turnIndex: number) {
    await handleScoreChange(s)

    if (activeConversationId) {
      fetch(`/api/conversations/${activeConversationId}/messages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ turnIndex, sycophancyScore: s }),
      }).catch(() => {})
    }

    setSliderLocked(true)
    setExplorationConfirmed(true)
  }

  async function handleSend() {
    if (!input.trim() || isLoading) return

    const question = input.trim()
    setInput("")
    setIsLoading(true)

    let conversationId = activeConversationId

    if (!conversationId) {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: question.slice(0, 80) }),
      })
      const newConv: Conversation = await res.json()
      conversationId = newConv.id
      setActiveConversationId(conversationId)
      setConversations((prev) => [newConv, ...prev])
    }

    if (conversationId) {
      setConversationScores((prev) => prev[conversationId!] ? prev : { ...prev, [conversationId!]: score })
    }

    const useExploration = isNewChat && explorationTurns.length < 3 && !explorationConfirmed

    if (useExploration) {
      const contextMessages: { role: "user" | "assistant"; content: string }[] = [
        ...explorationTurns.flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.responses[t.canonicalScore]?.text || "" },
        ]),
        { role: "user" as const, content: question },
      ]

      const newTurnIndex = explorationTurns.length
      const emptyResponses: Record<number, ExplorationResponse> = {}
      for (let s = 1; s <= 5; s++) emptyResponses[s] = { text: "", done: false }
      setExplorationTurns((prev) => [
        ...prev,
        { question, canonicalScore: score, responses: emptyResponses, flippedScore: null },
      ])

      let canonicalText = ""

      const scorePromises = Array.from({ length: 5 }, (_, i) => {
        const s = i + 1
        return streamScore(
          s,
          contextMessages,
          (textChunk) => {
            if (s === score) canonicalText += textChunk
            setExplorationTurns((prev) => {
              const updated = [...prev]
              const turn = { ...updated[newTurnIndex], responses: { ...updated[newTurnIndex].responses } }
              turn.responses[s] = { ...turn.responses[s], text: turn.responses[s].text + textChunk }
              updated[newTurnIndex] = turn
              return updated
            })
          }
        ).then(() => {
          setExplorationTurns((prev) => {
            const updated = [...prev]
            const turn = { ...updated[newTurnIndex], responses: { ...updated[newTurnIndex].responses } }
            turn.responses[s] = { ...turn.responses[s], done: true }
            updated[newTurnIndex] = turn
            return updated
          })
        })
      })

      await Promise.all(scorePromises)

      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "user", content: question },
            { role: "assistant", content: canonicalText, thinking: null, sycophancyScore: score },
          ],
        }),
      })

      const now = new Date().toISOString()
      setConversations((prev) => {
        const updated = prev.map((c) => (c.id === conversationId ? { ...c, updatedAt: now } : c))
        return [
          updated.find((c) => c.id === conversationId)!,
          ...updated.filter((c) => c.id !== conversationId),
        ]
      })

      setIsLoading(false)
    } else {
      setSliderLocked(true)

      const userMessage: Message = { role: "user", content: question }
      const newMessages = [...messages, userMessage]
      setMessages(newMessages)
      setStreamingText("")

      const apiMessages = [
        ...explorationTurns.flatMap((t) => [
          { role: "user" as const, content: t.question },
          { role: "assistant" as const, content: t.responses[t.canonicalScore]?.text || "" },
        ]),
        ...newMessages.map(({ role, content }) => ({ role, content })),
      ]

      const res = await fetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ messages: apiMessages, fullThinking: false, conversationId }),
        headers: { "Content-Type": "application/json" },
      })

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let accText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "))

        for (const line of lines) {
          const data = JSON.parse(line.slice(6))

          if (data.type === "text") {
            accText += data.text
            setStreamingText(accText)
          } else if (data.type === "done") {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: accText,
                thinking: null,
                createdAt: new Date().toISOString(),
                sycophancyScore: score,
              },
            ])
            setStreamingText("")
            setIsLoading(false)
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
    if (val === 3) return "Neutral"
    if (val === 4) return "Agreeable"
    return "Sycophantic"
  }

  const showAliasTooltip = !alias && !aliasTooltipDismissed
  const showScoreTooltip = !scoreTooltipDismissed
  // suppress unused warning
  void scoreManuallySet

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-roboto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-200 z-10">
        <div className="flex items-center gap-3">
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
        </div>
        <div className="flex items-center gap-3">
          {showAliasTooltip && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-900 border border-zinc-200 rounded-lg bg-white whitespace-nowrap shadow-sm">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0 cursor-pointer hover:opacity-75 transition-opacity"
                style={{ backgroundColor: "#fc5432" }}
                onClick={() => setAliasTooltipDismissed(true)}
              />
              Set your user name here.
            </div>
          )}
          <span className="text-xs text-zinc-900">Username</span>
          <div className="relative flex items-center">
            <input
              ref={aliasInputRef}
              type="text"
              className="px-3 py-1.5 text-xs border border-zinc-200 rounded-lg bg-zinc-50 focus:bg-white focus:ring-2 focus:ring-zinc-900 outline-none transition-all"
              style={{ paddingRight: aliasFocused ? "46px" : undefined }}
              placeholder="How should I call you?"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onFocus={() => setAliasFocused(true)}
              onBlur={(e) => {
                setAliasFocused(false)
                handleAliasUpdate(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  aliasInputRef.current?.blur()
                }
              }}
            />
            {aliasFocused && (
              <button
                onMouseDown={(e) => {
                  e.preventDefault()
                  aliasInputRef.current?.blur()
                }}
                className="absolute right-1.5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-100 hover:bg-zinc-200 rounded transition-colors"
              >
                Done
              </button>
            )}
          </div>
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
            {conversations.map((conv) => {
              const convScore = conversationScores[conv.id]
              const { base, continuation } = parseChatTitle(conv.title)
              return (
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
                  <div className="flex items-start gap-1.5">
                    <span
                      className="mt-[3px] w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: convScore ? LEVEL_COLORS[convScore] : "transparent" }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium leading-snug break-words whitespace-normal">{base}</p>
                      {continuation && (
                        <p className="text-[10px] mt-0.5" style={{ color: convScore ? LEVEL_COLORS[convScore] : "#a1a1aa" }}>
                          {continuation}
                        </p>
                      )}
                      <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(conv.updatedAt)}</p>
                    </div>
                  </div>
                </button>
              )
            })}
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
              ) : messages.length === 0 && explorationTurns.length === 0 && !streamingText && !isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-zinc-400">Start a conversation...</p>
                </div>
              ) : null}

              {/* Exploration turns */}
              {explorationTurns.map((turn, turnIndex) => {
                const isLastTurn = turnIndex === 2
                const allDone = Object.values(turn.responses).every((r) => r.done)
                return (
                  <div key={`exp-${turnIndex}`} className="space-y-3">
                    <div className="flex justify-end">
                      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-zinc-900 text-white text-sm leading-relaxed">
                        {turn.question}
                      </div>
                    </div>

                    <p className="text-[10px] text-zinc-400 pl-0.5">
                      {turnIndex === 0
                        ? "Here's how the response looks across all 5 sycophancy levels."
                        : isLastTurn
                        ? "One more round — pick your level to lock in the conversation style."
                        : "Same question, different styles. Pick a card to choose."}
                    </p>

                    {turn.flippedScore !== null && allDone && (() => {
                      const meta = SCORE_LABELS[turn.flippedScore]
                      return (
                        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white border border-zinc-200">
                          <span className="text-xs text-zinc-500">
                            <span className="font-semibold" style={{ color: meta.hex }}>Level {turn.flippedScore} · {meta.label}</span>
                            {" "}— lock this in?
                          </span>
                          <button
                            onClick={() => chooseExplorationLevel(turn.flippedScore!, turnIndex)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0 ml-3"
                            style={{ backgroundColor: meta.hex }}
                          >
                            Lock in
                            <span>→</span>
                          </button>
                        </div>
                      )
                    })()}

                    <div
                      className="flex gap-3 overflow-x-auto pb-2"
                      style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch" }}
                    >
                      {Array.from({ length: 5 }, (_, i) => {
                        const s = i + 1
                        const resp = turn.responses[s]
                        const meta = SCORE_LABELS[s]
                        const isSelected = turn.flippedScore === s
                        const isStreaming = resp && !resp.done && resp.text !== ""
                        const isDone = resp?.done
                        const isCurrentScore = s === score

                        return (
                          <div
                            key={s}
                            onClick={() => {
                              if (!isDone) return
                              toggleExplorationFlip(turnIndex, s)
                              handleScoreChange(s)
                            }}
                            style={{ scrollSnapAlign: "start", minWidth: "220px", maxWidth: "220px" }}
                            className={`flex flex-col rounded-xl border p-3.5 flex-shrink-0 transition-all duration-150 ${
                              isSelected
                                ? "border-zinc-800 shadow-md bg-white"
                                : isDone
                                ? `${meta.pillBg} ${meta.pillBorder} cursor-pointer hover:shadow-sm`
                                : `${meta.pillBg} ${meta.pillBorder} cursor-default opacity-80`
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-mono text-zinc-400 tabular-nums">{s}</span>
                                <span className="text-xs font-semibold" style={{ color: meta.hex }}>{meta.label}</span>
                                {isCurrentScore && (
                                  <span
                                    className="text-[9px] rounded px-1 py-0.5 leading-none font-medium"
                                    style={{ color: meta.hex, border: `1px solid ${meta.hex}`, opacity: 0.8 }}
                                  >
                                    current
                                  </span>
                                )}
                              </div>
                              <span className={`text-[10px] ${isDone ? "text-zinc-300" : "text-amber-400"}`}>
                                {isDone ? "✓" : isStreaming ? "writing…" : "waiting…"}
                              </span>
                            </div>

                            <div className="flex-1 overflow-y-auto h-36">
                              {(isStreaming || isDone) && resp.text && (
                                <MarkdownText content={resp.text} className="!text-xs text-zinc-700" />
                              )}
                              {isStreaming && (
                                <span className="inline-block w-1 h-3 bg-zinc-400 ml-0.5 animate-pulse" />
                              )}
                              {!isStreaming && !isDone && (
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

                    {explorationConfirmed && turnIndex === explorationTurns.length - 1 && (() => {
                      const meta = SCORE_LABELS[score]
                      return (
                        <div
                          className="rounded-xl px-4 py-3 text-xs leading-relaxed"
                          style={{
                            backgroundColor: `${meta.hex}12`,
                            border: `1px solid ${meta.hex}40`,
                            color: meta.hex,
                          }}
                        >
                          <span className="font-semibold">Level {score} — {meta.label}</span> is now locked for this conversation.{" "}
                          <span className="text-zinc-500">To chat at a different level, click <span className="font-medium text-zinc-600">&ldquo;Continue at a different level&rdquo;</span> in the right panel.</span>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}

              {/* Normal messages */}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  {msg.role === "user" ? (
                    <div className="max-w-[80%] px-4 py-2.5 rounded-2xl bg-zinc-900 text-white text-sm leading-relaxed">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="max-w-[80%] flex flex-col gap-1">
                      <div
                        className="px-4 py-2.5 rounded-2xl bg-white text-zinc-800"
                        style={{
                          border: `1.5px solid ${msg.sycophancyScore ? getSliderColor(msg.sycophancyScore) : "#c8c8d0"}`,
                        }}
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
              {isLoading && !streamingText && messages.length > 0 && (
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
                  className="p-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-40 flex items-center justify-center"
                  aria-label="Send"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Right panel — sycophancy slider only */}
          <div className="flex flex-col w-72 flex-shrink-0 overflow-hidden">
            <div className="px-6 py-5 bg-white border-b border-zinc-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Response Style</span>
                <div className="flex items-center gap-1.5">
                  {sliderLocked && (
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="text-zinc-400 flex-shrink-0">
                      <rect x="2" y="5" width="7" height="5" rx="1.2" fill="currentColor" />
                      <path d="M3.5 5V3.5a2 2 0 014 0V5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
                    </svg>
                  )}
                  <span className="text-xs font-semibold text-zinc-900">{getSliderLabel(score)}</span>
                </div>
              </div>
              {showScoreTooltip && !sliderLocked && (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 mb-3 text-xs text-zinc-900 border border-zinc-200 rounded-lg bg-white shadow-sm">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0 cursor-pointer hover:opacity-75 transition-opacity"
                    style={{ backgroundColor: "#fc5432" }}
                    onClick={() => setScoreTooltipDismissed(true)}
                  />
                  {isNewChat && explorationTurns.length < 3
                    ? "Click any response card to jump to that level, or drag the slider to fine-tune."
                    : "Tune how agreeable or critical the AI should be in the current chat with the slider."}
                </div>
              )}
              <SycophancySlider score={score} onChange={handleScoreChange} disabled={sliderLocked} />
              <div className="flex justify-between -mt-1">
                <span className="text-xs text-zinc-400">Antagonistic</span>
                <span className="text-xs text-zinc-400">Sycophantic</span>
              </div>
              {sliderLocked && (
                <button
                  onClick={forkConversation}
                  disabled={isLoading}
                  className="mt-4 w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-zinc-600 border border-zinc-200 rounded-lg hover:bg-zinc-50 hover:border-zinc-300 transition-colors disabled:opacity-40"
                >
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 2.5h3.5M7.5 2.5H11M4 2.5v2.5a3 3 0 003 3M9 2.5v2.5a3 3 0 01-3 3M6.5 8v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Continue with different level
                </button>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
