"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { buildLoginRedirect } from "@/lib/auth"

// ─── Types ────────────────────────────────────────────────────────────────────

interface MentorRequest {
  id: string
  content: string
  editorSnapshot: string | null
  resolved: number
  resolvedAt: string | null
  createdAt: string
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

// ─── Confetti particle ────────────────────────────────────────────────────────

function ConfettiBurst({ origin }: { origin: { x: number; y: number } }) {
  const colors = ["#fc5432", "#f8961e", "#06d6a0", "#3a86ff", "#f25c54", "#3a0ca3", "#ffd166"]
  const particles = Array.from({ length: 28 }, (_, i) => ({
    id: i,
    color: colors[i % colors.length],
    angle: (i / 28) * 360 + Math.random() * 15,
    distance: 60 + Math.random() * 60,
    size: 5 + Math.random() * 5,
    shape: Math.random() > 0.5 ? "circle" : "rect",
    delay: Math.random() * 100,
  }))

  return (
    <div
      style={{
        position: "fixed",
        left: origin.x,
        top: origin.y,
        pointerEvents: "none",
        zIndex: 9999,
      }}
    >
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180
        const tx = Math.cos(rad) * p.distance
        const ty = Math.sin(rad) * p.distance
        return (
          <div
            key={p.id}
            style={{
              position: "absolute",
              left: -p.size / 2,
              top: -p.size / 2,
              width: p.shape === "circle" ? p.size : p.size * 0.7,
              height: p.shape === "circle" ? p.size : p.size * 1.4,
              borderRadius: p.shape === "circle" ? "50%" : "2px",
              backgroundColor: p.color,
              animation: `confetti-fly 0.8s ease-out ${p.delay}ms forwards`,
              // @ts-expect-error custom css props
              "--tx": `${tx}px`,
              "--ty": `${ty}px`,
            }}
          />
        )
      })}
    </div>
  )
}

// ─── Rich text toolbar ────────────────────────────────────────────────────────

function RichToolbar({ editorRef }: { editorRef: React.RefObject<HTMLDivElement | null> }) {
  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
  }

  const btns: { label: string; cmd: string; val?: string; title: string }[] = [
    { label: "B", cmd: "bold", title: "Bold" },
    { label: "I", cmd: "italic", title: "Italic" },
    { label: "U", cmd: "underline", title: "Underline" },
    { label: "H1", cmd: "formatBlock", val: "h1", title: "Heading 1" },
    { label: "H2", cmd: "formatBlock", val: "h2", title: "Heading 2" },
    { label: "¶", cmd: "formatBlock", val: "p", title: "Paragraph" },
    { label: "• List", cmd: "insertUnorderedList", title: "Bullet list" },
    { label: "1. List", cmd: "insertOrderedList", title: "Numbered list" },
  ]

  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: "6px 8px",
        borderBottom: "1px solid #e4e4e7",
        background: "#fafafa",
        flexWrap: "wrap",
      }}
    >
      {btns.map((b) => (
        <button
          key={b.label}
          title={b.title}
          onMouseDown={(e) => { e.preventDefault(); exec(b.cmd, b.val) }}
          style={{
            fontFamily: "'Dosis', sans-serif",
            fontWeight: 600,
            fontSize: 11,
            padding: "2px 8px",
            border: "1px solid #e4e4e7",
            borderRadius: 4,
            background: "white",
            color: "#18181b",
            cursor: "pointer",
            lineHeight: "1.5",
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MentorLetterPage() {
  const router = useRouter()

  // Auth
  const [alias, setAlias] = useState("")
  const [aliasLoading, setAliasLoading] = useState(true)
  const [aliasFocused, setAliasFocused] = useState(false)
  const [aliasTooltipDismissed, setAliasTooltipDismissed] = useState(false)
  const aliasInputRef = useRef<HTMLInputElement>(null)

  // Requests
  const [requests, setRequests] = useState<MentorRequest[]>([])
  const [requestInput, setRequestInput] = useState("")
  const [requestInputFocused, setRequestInputFocused] = useState(false)
  const requestTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Editor
  const editorRef = useRef<HTMLDivElement>(null)

  // Points & AI unlock
  const [points, setPoints] = useState(0)
  const POINTS_THRESHOLD = 500
  const [aiUnlocked, setAiUnlocked] = useState(false)
  const [aiRoundsLeft, setAiRoundsLeft] = useState(0)

  // AI chat
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([])
  const [aiInput, setAiInput] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiStreamingText, setAiStreamingText] = useState("")
  const aiChatEndRef = useRef<HTMLDivElement>(null)
  const aiInputRef = useRef<HTMLTextAreaElement>(null)

  // Confetti
  const [confettiBursts, setConfettiBursts] = useState<{ id: number; x: number; y: number }[]>([])
  const confettiCounter = useRef(0)

  // Load session
  useEffect(() => {
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.alias) setAlias(d.alias)
        setAliasLoading(false)
      })
      .catch(() => {
        router.push(buildLoginRedirect("/mentor-letter"))
      })
  }, [router])

  // Load existing requests
  useEffect(() => {
    fetch("/api/mentor-requests")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.requests) setRequests(d.requests)
      })
      .catch(() => {})
  }, [])

  // Scroll AI chat to bottom
  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [aiMessages, aiStreamingText])

  // Auto-resize request textarea
  const resizeRequestTextarea = useCallback(() => {
    const el = requestTextareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 120) + "px"
  }, [])

  // Track typing points in request textarea
  const handleRequestKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmitRequest()
      return
    }
    if (e.key.length === 1) {
      setPoints((p) => p + 1)
    }
  }, [requestInput]) // eslint-disable-line react-hooks/exhaustive-deps

  // Track typing points in editor
  const handleEditorKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key.length === 1 || e.key === "Backspace" || e.key === "Delete") {
      setPoints((p) => p + 1)
    }
  }, [])

  // Submit a new request
  async function handleSubmitRequest() {
    const content = requestInput.trim()
    if (!content) return

    const editorSnapshot = editorRef.current?.innerHTML ?? ""
    setRequestInput("")
    if (requestTextareaRef.current) {
      requestTextareaRef.current.style.height = "auto"
    }

    const res = await fetch("/api/mentor-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, editorSnapshot }),
    })
    if (res.ok) {
      const data = await res.json()
      setRequests((prev) => [data.request, ...prev])
    }
  }

  // Resolve a request
  async function handleResolve(id: string, buttonEl: HTMLButtonElement) {
    const rect = buttonEl.getBoundingClientRect()
    const bId = ++confettiCounter.current
    setConfettiBursts((prev) => [...prev, { id: bId, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }])
    setTimeout(() => setConfettiBursts((prev) => prev.filter((b) => b.id !== bId)), 1200)

    setPoints((p) => p + 100)

    const res = await fetch(`/api/mentor-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: 1 }),
    })
    if (res.ok) {
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, resolved: 1, resolvedAt: new Date().toISOString() } : r))
    }
  }

  // Unlock AI when threshold reached
  useEffect(() => {
    if (points >= POINTS_THRESHOLD && !aiUnlocked && aiRoundsLeft === 0) {
      setAiUnlocked(true)
      setAiRoundsLeft(3)
      setPoints(0)
    }
  }, [points, aiUnlocked, aiRoundsLeft])

  // Send AI message
  async function handleAiSend() {
    const content = aiInput.trim()
    if (!content || aiLoading || aiRoundsLeft <= 0) return

    const newMsg: ChatMessage = { role: "user", content }
    const updatedMessages = [...aiMessages, newMsg]
    setAiMessages(updatedMessages)
    setAiInput("")
    setAiLoading(true)
    setAiStreamingText("")

    const unresolvedTasks = requests
      .filter((r) => !r.resolved)
      .map((r) => r.content)

    const editorContent = editorRef.current?.innerHTML ?? ""

    const res = await fetch("/api/mentor-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: updatedMessages.map(({ role, content: c }) => ({ role, content: c })),
        editorContent,
        unresolvedTasks,
      }),
    })

    if (!res.ok || !res.body) {
      setAiLoading(false)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let accText = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue
        try {
          const data = JSON.parse(line.slice(6))
          if (data.type === "text") {
            accText += data.text
            setAiStreamingText(accText)
          } else if (data.type === "done") {
            setAiMessages((prev) => [...prev, { role: "assistant", content: accText }])
            setAiStreamingText("")
            setAiLoading(false)
            const newRounds = aiRoundsLeft - 1
            setAiRoundsLeft(newRounds)
            if (newRounds <= 0) {
              setAiUnlocked(false)
            }
          }
        } catch { /* continue */ }
      }
    }
  }

  // Alias update
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

  const progressPct = Math.min(100, (points / POINTS_THRESHOLD) * 100)
  const showAliasTooltip = !alias && !aliasTooltipDismissed && !aliasLoading
  const unresolvedCount = requests.filter((r) => !r.resolved).length

  return (
    <div
      className="flex flex-col h-screen"
      style={{ fontFamily: "'Roboto', sans-serif", background: "#fafafa" }}
    >
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Dosis:wght@200..800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap');

        .rich-editor h1 { font-size: 1.5em; font-weight: 700; margin: 0.5em 0; }
        .rich-editor h2 { font-size: 1.2em; font-weight: 600; margin: 0.4em 0; }
        .rich-editor p  { margin: 0.3em 0; }
        .rich-editor ul { list-style: disc inside; padding-left: 1em; margin: 0.3em 0; }
        .rich-editor ol { list-style: decimal inside; padding-left: 1em; margin: 0.3em 0; }

        @keyframes confetti-fly {
          0%   { transform: translate(0, 0) rotate(0deg); opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) rotate(360deg); opacity: 0; }
        }

        .request-item {
          border-bottom: 1px solid #f0f0f0;
          padding: 10px 0;
        }
        .request-item:last-child { border-bottom: none; }

        .resolve-btn {
          font-family: 'Dosis', sans-serif;
          font-weight: 600;
          font-size: 10px;
          padding: 3px 8px;
          border: 1px solid #e4e4e7;
          border-radius: 20px;
          background: white;
          color: #18181b;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s, color 0.15s;
        }
        .resolve-btn:hover { background: #18181b; color: white; border-color: #18181b; }
        .resolve-btn.resolved { background: #e8faf2; color: #059669; border-color: #a7f3d0; cursor: default; }

        .ai-input-area:focus-within { box-shadow: 0 0 0 2px #18181b; }
      `}</style>

      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 20px",
          background: "white",
          borderBottom: "1px solid #e4e4e7",
          zIndex: 10,
          flexShrink: 0,
        }}
      >
        <span style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 16, color: "#18181b" }}>
          I (don&apos;t) need AI
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {showAliasTooltip && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 10px", fontSize: 11, color: "#18181b",
              border: "1px solid #e4e4e7", borderRadius: 8, background: "white",
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)", whiteSpace: "nowrap",
            }}>
              <span
                style={{ width: 8, height: 8, borderRadius: "50%", background: "#fc5432", flexShrink: 0, cursor: "pointer" }}
                onClick={() => setAliasTooltipDismissed(true)}
              />
              Set your user name here.
            </div>
          )}
          <span style={{ fontSize: 12, color: "#18181b" }}>Username</span>
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <input
              ref={aliasInputRef}
              type="text"
              style={{
                padding: "6px 12px",
                paddingRight: aliasFocused ? 46 : 12,
                fontSize: 12,
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                background: "#fafafa",
                outline: "none",
                transition: "all 0.15s",
              }}
              placeholder="How should I call you?"
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              onFocus={() => setAliasFocused(true)}
              onBlur={(e) => { setAliasFocused(false); handleAliasUpdate(e.target.value) }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aliasInputRef.current?.blur() } }}
            />
            {aliasFocused && (
              <button
                onMouseDown={(e) => { e.preventDefault(); aliasInputRef.current?.blur() }}
                style={{
                  position: "absolute", right: 6,
                  padding: "2px 6px", fontSize: 10, fontFamily: "'Dosis', sans-serif", fontWeight: 600,
                  color: "#52525b", background: "#f4f4f5", border: "none", borderRadius: 4, cursor: "pointer",
                }}
              >
                Done
              </button>
            )}
          </div>
          <button
            onClick={async () => { await fetch("/api/logout", { method: "POST" }); router.push("/login") }}
            style={{ fontSize: 12, color: "#a1a1aa", background: "none", border: "none", cursor: "pointer" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#18181b")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#a1a1aa")}
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main 3-column layout */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── Left 1/4 ──────────────────────────────────────────────────── */}
        <div
          style={{
            width: "25%", flexShrink: 0,
            borderRight: "1px solid #e4e4e7",
            display: "flex", flexDirection: "column",
            padding: 16, gap: 16, overflowY: "auto",
          }}
        >
          {/* Task board */}
          <div>
            <p style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
              Now
            </p>
            <div style={{ border: "1.5px solid #18181b", borderRadius: 0, padding: "12px 14px" }}>
              <p style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 13, color: "#18181b", marginBottom: 4 }}>
                Write a mentor request email
              </p>
              <p style={{ fontSize: 12, color: "#52525b", lineHeight: 1.5 }}>
                Draft a thoughtful email to a potential mentor. Introduce yourself, explain your goals, and make a specific ask.
              </p>
            </div>
          </div>

          {/* Game plan */}
          <div>
            <div style={{
              border: "1px solid #e4e4e7",
              borderRadius: 10,
              padding: "12px 14px",
              background: "white",
            }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fc5432", flexShrink: 0, marginTop: 3 }} />
                <span style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 13, color: "#18181b" }}>
                  Game Plan I
                </span>
              </div>
              <ol style={{ fontSize: 11.5, color: "#52525b", lineHeight: 1.6, paddingLeft: 14, margin: 0 }}>
                <li>Use the editor to draft your email.</li>
                <li>Add blockers or sub-tasks in the request box below the editor — they appear on the right.</li>
                <li>Mark each task as resolved when done (+100 pts).</li>
                <li>Type to earn points (every keystroke = 1 pt).</li>
                <li>Reach <strong>500 pts</strong> to unlock the AI for 3 Q&amp;A rounds.</li>
                <li>The AI knows your draft and your unresolved tasks.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* ── Middle 1/2 ────────────────────────────────────────────────── */}
        <div
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            borderRight: "1px solid #e4e4e7", overflow: "hidden",
          }}
        >
          {/* Rich text editor — takes remaining space */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/* Toolbar */}
            <RichToolbar editorRef={editorRef} />
            {/* Editor area */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              className="rich-editor"
              onKeyDown={handleEditorKeyDown}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "16px 20px",
                fontSize: 14,
                lineHeight: 1.7,
                color: "#18181b",
                outline: "none",
                fontFamily: "'Roboto', sans-serif",
                background: "white",
              }}
              data-placeholder="Start writing your mentor request email here…"
            />
            {/* Placeholder style */}
            <style>{`
              .rich-editor:empty:before {
                content: attr(data-placeholder);
                color: #a1a1aa;
                pointer-events: none;
              }
            `}</style>
          </div>

          {/* Request textbox at the bottom */}
          <div
            style={{
              borderTop: "1px solid #e4e4e7",
              padding: "10px 16px",
              background: "white",
              flexShrink: 0,
            }}
          >
            <p style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 600, fontSize: 10, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
              Add a request or task
            </p>
            <div
              className="ai-input-area"
              style={{
                display: "flex", gap: 8, alignItems: "flex-end",
                border: "1px solid #e4e4e7", borderRadius: 12,
                padding: "8px 10px", background: requestInputFocused ? "white" : "#fafafa",
                transition: "background 0.15s",
              }}
            >
              <textarea
                ref={requestTextareaRef}
                rows={1}
                value={requestInput}
                onChange={(e) => { setRequestInput(e.target.value); resizeRequestTextarea() }}
                onKeyDown={handleRequestKeyDown}
                onFocus={() => setRequestInputFocused(true)}
                onBlur={() => setRequestInputFocused(false)}
                placeholder="What do you need help with? Press Enter to send…"
                style={{
                  flex: 1, resize: "none", border: "none", outline: "none",
                  fontSize: 13, lineHeight: 1.5, background: "transparent",
                  fontFamily: "'Roboto', sans-serif", color: "#18181b",
                  minHeight: 22, maxHeight: 120,
                }}
              />
              <button
                onClick={handleSubmitRequest}
                disabled={!requestInput.trim()}
                style={{
                  padding: "5px 10px", background: requestInput.trim() ? "#18181b" : "#e4e4e7",
                  color: requestInput.trim() ? "white" : "#a1a1aa",
                  border: "none", borderRadius: 8, cursor: requestInput.trim() ? "pointer" : "default",
                  fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 11,
                  transition: "all 0.15s", flexShrink: 0,
                }}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* ── Right 1/4 ─────────────────────────────────────────────────── */}
        <div
          style={{
            width: "35%", flexShrink: 0,
            display: "flex", flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Request list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px" }}>
            <p style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
              Requests{unresolvedCount > 0 && (
                <span style={{ marginLeft: 6, background: "#18181b", color: "white", borderRadius: 10, padding: "1px 6px", fontSize: 10 }}>
                  {unresolvedCount}
                </span>
              )}
            </p>

            {requests.length === 0 && (
              <p style={{ fontSize: 12, color: "#a1a1aa", fontStyle: "italic" }}>No requests yet.</p>
            )}

            {requests.map((req) => (
              <div key={req.id} className="request-item">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <p
                    style={{
                      flex: 1, fontSize: 12, color: req.resolved ? "#a1a1aa" : "#18181b",
                      lineHeight: 1.5, textDecoration: req.resolved ? "line-through" : "none",
                      margin: 0,
                    }}
                  >
                    {req.content}
                  </p>
                  {!req.resolved && (
                    <button
                      className="resolve-btn"
                      onClick={(e) => handleResolve(req.id, e.currentTarget)}
                    >
                      ✓ Resolved
                    </button>
                  )}
                  {req.resolved && (
                    <span className="resolve-btn resolved">✓ Done</span>
                  )}
                </div>
                <p style={{ fontSize: 10, color: "#a1a1aa", marginTop: 3 }}>
                  {new Date(req.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>

          {/* Progress bar + AI section */}
          <div
            style={{
              borderTop: "1px solid #e4e4e7", padding: "12px 14px", background: "white", flexShrink: 0,
            }}
          >
            {/* Progress bar */}
            <div style={{ marginBottom: aiUnlocked ? 12 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 10, color: "#a1a1aa", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {aiUnlocked ? `AI unlocked · ${aiRoundsLeft} round${aiRoundsLeft !== 1 ? "s" : ""} left` : `Unlock AI · ${points} / ${POINTS_THRESHOLD} pts`}
                </span>
                {aiUnlocked && (
                  <span style={{ fontSize: 10, color: "#059669", fontFamily: "'Dosis', sans-serif", fontWeight: 700 }}>🤖 Active</span>
                )}
              </div>
              <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: aiUnlocked ? "100%" : `${progressPct}%`,
                    background: aiUnlocked ? "#059669" : "#18181b",
                    borderRadius: 3,
                    transition: "width 0.3s ease",
                  }}
                />
              </div>
              {!aiUnlocked && (
                <p style={{ fontSize: 10, color: "#a1a1aa", marginTop: 4 }}>
                  Type in the editor or request box, and resolve tasks to earn points.
                </p>
              )}
            </div>

            {/* AI chat (only when unlocked) */}
            {aiUnlocked && (
              <div>
                {/* Chat messages */}
                {(aiMessages.length > 0 || aiStreamingText) && (
                  <div
                    style={{
                      maxHeight: 200, overflowY: "auto",
                      marginBottom: 8, display: "flex", flexDirection: "column", gap: 6,
                    }}
                  >
                    {aiMessages.map((msg, i) => (
                      <div
                        key={i}
                        style={{
                          alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                          maxWidth: "88%",
                          padding: "6px 10px",
                          borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                          background: msg.role === "user" ? "#18181b" : "#f4f4f5",
                          color: msg.role === "user" ? "white" : "#18181b",
                          fontSize: 11.5,
                          lineHeight: 1.5,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {msg.content}
                      </div>
                    ))}
                    {aiStreamingText && (
                      <div
                        style={{
                          alignSelf: "flex-start", maxWidth: "88%",
                          padding: "6px 10px", borderRadius: "12px 12px 12px 2px",
                          background: "#f4f4f5", color: "#18181b",
                          fontSize: 11.5, lineHeight: 1.5, whiteSpace: "pre-wrap",
                        }}
                      >
                        {aiStreamingText}
                        <span style={{ display: "inline-block", width: 4, height: 12, background: "#a1a1aa", marginLeft: 2, animation: "pulse 1s infinite" }} />
                      </div>
                    )}
                    <div ref={aiChatEndRef} />
                  </div>
                )}

                {/* AI input */}
                <div
                  style={{
                    display: "flex", gap: 6, alignItems: "flex-end",
                    border: "1px solid #e4e4e7", borderRadius: 10,
                    padding: "6px 8px", background: "#fafafa",
                  }}
                >
                  <textarea
                    ref={aiInputRef}
                    rows={1}
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAiSend() }
                    }}
                    disabled={aiLoading}
                    placeholder={aiLoading ? "Thinking…" : "Ask the AI…"}
                    style={{
                      flex: 1, resize: "none", border: "none", outline: "none",
                      fontSize: 12, lineHeight: 1.4, background: "transparent",
                      fontFamily: "'Roboto', sans-serif", color: "#18181b",
                    }}
                  />
                  <button
                    onClick={handleAiSend}
                    disabled={aiLoading || !aiInput.trim()}
                    style={{
                      padding: "4px 8px", background: "#18181b",
                      color: "white", border: "none", borderRadius: 6,
                      cursor: "pointer", fontFamily: "'Dosis', sans-serif",
                      fontWeight: 700, fontSize: 10, flexShrink: 0,
                      opacity: (aiLoading || !aiInput.trim()) ? 0.4 : 1,
                    }}
                  >
                    Ask
                  </button>
                </div>
                <p style={{ fontSize: 10, color: "#a1a1aa", marginTop: 4, textAlign: "right" }}>
                  {aiRoundsLeft} round{aiRoundsLeft !== 1 ? "s" : ""} remaining
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confetti bursts */}
      {confettiBursts.map((b) => (
        <ConfettiBurst key={b.id} origin={{ x: b.x, y: b.y }} />
      ))}
    </div>
  )
}
