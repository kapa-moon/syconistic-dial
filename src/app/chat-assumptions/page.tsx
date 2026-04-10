"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { MarkdownText } from "@/lib/markdown"
import { FeedbackWidget } from "@/components/FeedbackWidget"
import { buildLoginRedirect } from "@/lib/auth"

// ─── Mental model types ───────────────────────────────────────────────────────

interface InductBelief {
  score: number
  explanation: string
}

interface InductMentalModel {
  mental_model: {
    beliefs: {
      validation_seeking: InductBelief
      user_rightness: InductBelief
      user_information_advantage: InductBelief
      objectivity_seeking: InductBelief
    }
  }
}

interface TypesSupportBelief {
  score: number
  explanation: string
}

interface TypesSupportMentalModel {
  mental_model: {
    support_seeking: {
      emotional_support: TypesSupportBelief
      social_companionship: TypesSupportBelief
      belonging_support: TypesSupportBelief
      information_guidance: TypesSupportBelief
      tangible_support: TypesSupportBelief
    }
  }
}

interface CombinedMentalModel {
  induct?: InductMentalModel
  typesSupport?: TypesSupportMentalModel
  inductUser?: Record<string, number> | null
  typesSupportUser?: Record<string, number> | null
  inductUserReasons?: Record<string, string> | null
  typesSupportUserReasons?: Record<string, string> | null
  inductUserReactions?: Record<string, "up" | "down"> | null
  typesSupportUserReactions?: Record<string, "up" | "down"> | null
}

// Previous color scheme (kept for reference):
// const INDUCT_SERIES_OLD_COLORS = [
//   { key: "validation_seeking",         color: "#2d5016" },
//   { key: "user_rightness",             color: "#1565c0" },
//   { key: "user_information_advantage", color: "#6a1b9a" },
//   { key: "objectivity_seeking",        color: "#c62828" },
// ]
// const TYPES_SUPPORT_SERIES_OLD_COLORS = [
//   { key: "emotional_support",    color: "#e53935" },
//   { key: "social_companionship", color: "#f57c00" },
//   { key: "belonging_support",    color: "#2e7d32" },
//   { key: "information_guidance", color: "#0277bd" },
//   { key: "tangible_support",     color: "#6a1b9a" },
// ]

const INDUCT_SERIES: { key: keyof InductMentalModel["mental_model"]["beliefs"]; label: string; color: string }[] = [
  { key: "validation_seeking",         label: "Validation seeking",    color: "#f8961e" },
  { key: "user_rightness",             label: "User rightness",        color: "#619b8a" },
  { key: "user_information_advantage", label: "User info advantage",   color: "#f25c54" },
  { key: "objectivity_seeking",        label: "Objectivity seeking",   color: "#3c096c" },
]

const TYPES_SUPPORT_SERIES: { key: keyof TypesSupportMentalModel["mental_model"]["support_seeking"]; label: string; color: string }[] = [
  { key: "emotional_support",    label: "Emotional support",      color: "#ef476f" },
  { key: "social_companionship", label: "Social companionship",   color: "#06d6a0" },
  { key: "belonging_support",    label: "Belonging support",      color: "#3a0ca3" },
  { key: "information_guidance", label: "Information & guidance", color: "#f8961e" },
  { key: "tangible_support",     label: "Tangible support",       color: "#3a86ff" },
]

// ─── Mental model visualization ───────────────────────────────────────────────

// Draggable bar: thumb sits on the bar itself, aligns visually with the chart dot
function DraggableScoreBar({ aiScore, userScore, color, onChange }: {
  aiScore: number | null
  userScore: number | null
  color: string
  onChange: (score: number) => void
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const scoreFromEvent = (e: React.PointerEvent) => {
    const rect = trackRef.current!.getBoundingClientRect()
    return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  }

  const displayScore = userScore ?? aiScore ?? 0
  const hasUserSet = userScore !== null
  const pct = Math.round(displayScore * 100)

  return (
    <div
      ref={trackRef}
      className="relative h-5 cursor-ew-resize select-none"
      onPointerDown={(e) => { trackRef.current!.setPointerCapture(e.pointerId); dragging.current = true; onChange(scoreFromEvent(e)) }}
      onPointerMove={(e) => { if (dragging.current) onChange(scoreFromEvent(e)) }}
      onPointerUp={() => { dragging.current = false }}
    >
      {/* Track */}
      <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-zinc-100 rounded-full" />
      {/* AI fill */}
      {aiScore != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 rounded-full transition-opacity duration-300"
          style={{ width: `${aiScore * 100}%`, backgroundColor: color, opacity: hasUserSet ? 0.22 : 1 }}
        />
      )}
      {/* User fill */}
      {hasUserSet && (
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 rounded-full"
          style={{ width: `${displayScore * 100}%`, backgroundColor: color, transition: "width 0.05s ease" }}
        />
      )}
      {/* Ghost AI position marker when user has overridden */}
      {hasUserSet && aiScore != null && (
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full pointer-events-none"
          style={{ left: `calc(${aiScore * 100}% - 3px)`, backgroundColor: color, opacity: 0.28 }}
        />
      )}
      {/* Draggable thumb — sits right on the bar */}
      <div
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow pointer-events-none"
        style={{ left: `calc(${displayScore * 100}% - 8px)`, backgroundColor: color, transition: "left 0.05s ease" }}
      />
      {/* Score label */}
      <span
        className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pl-2 text-[10px] tabular-nums font-medium pointer-events-none"
        style={{ color }}
      >
        {pct}%
      </span>
    </div>
  )
}

// Chart: per-turn user overrides; locked turns show ghost AI + solid user dot
function ScoresAcrossTurnsChart({ series, turnsData, getScore, userScoresByTurn }: {
  series: { key: string; label: string; color: string }[]
  turnsData: unknown[]
  getScore: (mm: unknown, key: string) => number | null
  // full array of per-turn user scores; last entry may be live (being dragged)
  userScoresByTurn?: (Record<string, number> | null)[]
}) {
  if (turnsData.length < 1) return null

  const n = turnsData.length
  const width = 460
  const height = 200
  const pad = { left: 32, right: 12, top: 10, bottom: 28 }
  const iw = width - pad.left - pad.right
  const ih = height - pad.top - pad.bottom
  const xScale = (i: number) => pad.left + (n <= 1 ? iw / 2 : (i / Math.max(1, n - 1)) * iw)
  const yScale = (v: number) => pad.top + ih - v * ih

  const polylinePath = (pts: [number, number][]) => {
    if (pts.length === 0) return ""
    if (pts.length === 1) return `M ${pts[0][0]} ${pts[0][1]}`
    return "M " + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(" L ")
  }

  return (
    <div className="mt-3">
      <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-wide mb-1.5">Scores across turns</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ display: "block" }}>
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.left} y1={yScale(v)} x2={pad.left + iw} y2={yScale(v)} stroke="#e4e4e7" strokeWidth={0.75} />
            <text x={pad.left - 4} y={yScale(v) + 3.5} fontSize={9} fill="#a1a1aa" textAnchor="end">{v}</text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) =>
          n <= 8 || i === 0 || i === n - 1 || i % Math.ceil(n / 5) === 0
            ? <text key={i} x={xScale(i)} y={height - 6} fontSize={9} fill="#a1a1aa" textAnchor="middle">T{i + 1}</text>
            : null
        )}
        {series.map((s) => {
          const aiVals = turnsData.map((mm) => getScore(mm, s.key))
          const userVals = (userScoresByTurn ?? []).map((u) => u?.[s.key] ?? null)
          // Effective value: user override if present, else AI
          const effectiveVals = aiVals.map((v, i) => userVals[i] ?? v)
          const effectivePts = effectiveVals
            .map((v, i) => v != null ? [xScale(i), yScale(v)] as [number, number] : null)
            .filter(Boolean) as [number, number][]

          return (
            <g key={s.key}>
              {/* Single effective polyline — user-corrected where confirmed, AI elsewhere */}
              <path d={polylinePath(effectivePts)} fill="none" stroke={s.color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />

              {/* Ghost AI segments: for every turn where user overrode, draw a faint line
                  from the previous effective point to where the AI originally scored */}
              {aiVals.map((aiV, i) => {
                if (i === 0 || userVals[i] == null || aiV == null) return null
                const prevEffective = effectiveVals[i - 1]
                if (prevEffective == null) return null
                return (
                  <line
                    key={`ghost-seg-${i}`}
                    x1={xScale(i - 1)} y1={yScale(prevEffective)}
                    x2={xScale(i)} y2={yScale(aiV)}
                    stroke={s.color} strokeWidth={1.5} strokeLinecap="round"
                    strokeOpacity={0.22}
                    strokeDasharray="3 2"
                  />
                )
              })}

              {/* Per-turn dots */}
              {aiVals.map((aiV, i) => {
                const userV = userVals[i]
                const isLast = i === n - 1

                if (userV != null) {
                  // User-overridden turn: ghost AI dot + solid user dot
                  return (
                    <g key={i}>
                      {/* Ghost AI position */}
                      {aiV != null && (
                        <circle cx={xScale(i)} cy={yScale(aiV)} r={2} fill={s.color} fillOpacity={0.22} />
                      )}
                      {/* User dot: animated for live last turn, static for confirmed past turns */}
                      {isLast ? (
                        <g style={{ transform: `translate(${xScale(i)}px, ${yScale(userV)}px)`, transition: "transform 0.08s ease" }}>
                          <circle cx={0} cy={0} r={5} fill="white" stroke={s.color} strokeWidth={1.5} />
                          <circle cx={0} cy={0} r={2.5} fill={s.color} />
                        </g>
                      ) : (
                        <g>
                          <circle cx={xScale(i)} cy={yScale(userV)} r={4} fill="white" stroke={s.color} strokeWidth={1.5} />
                          <circle cx={xScale(i)} cy={yScale(userV)} r={2} fill={s.color} />
                        </g>
                      )}
                    </g>
                  )
                }

                // No user override: plain AI dot
                return aiV != null
                  ? <circle key={i} cx={xScale(i)} cy={yScale(aiV)} r={2.5} fill={s.color} />
                  : null
              })}
            </g>
          )
        })}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1 text-[9px] text-zinc-500">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ─── Score section with per-dimension confirm + reason input ──────────────────

function SectionBadge({ n }: { n: 1 | 2 }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, backgroundColor: "#18181b", color: "#fff", fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
      {n}
    </span>
  )
}

function ScoreSection({ title, sectionNumber, series, beliefs, userBeliefs, liveBeliefs, reactions, turnsData, userScoresByTurn, getScore, isLoading, onUserScoreChange, onConfirmDimension, onCancelDimension, onReactionChange }: {
  title: string
  sectionNumber?: 1 | 2
  series: { key: string; label: string; color: string }[]
  beliefs: Record<string, { score: number; explanation?: string }> | undefined
  userBeliefs?: Record<string, number> | null
  liveBeliefs?: Record<string, number> | null
  reactions?: Record<string, "up" | "down"> | null
  turnsData: unknown[]
  userScoresByTurn?: (Record<string, number> | null)[]
  getScore: (mm: unknown, key: string) => number | null
  isLoading: boolean
  onUserScoreChange: (key: string, score: number) => void
  onConfirmDimension: (key: string, reason: string) => void
  onCancelDimension: (key: string) => void
  onReactionChange: (key: string, dir: "up" | "down" | null) => void
}) {
  const [reasons, setReasons] = useState<Record<string, string>>({})

  const handleConfirm = (key: string) => {
    onConfirmDimension(key, reasons[key]?.trim() ?? "")
    setReasons((prev) => { const n = { ...prev }; delete n[key]; return n })
  }

  const toggleReaction = (key: string, dir: "up" | "down") => {
    onReactionChange(key, reactions?.[key] === dir ? null : dir)
  }

  return (
    <div>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Dosis:wght@400;500;600;700&display=swap');`}</style>
      {/* Section title with optional badge */}
      <div className="flex items-start gap-2 mb-3">
        {sectionNumber && <SectionBadge n={sectionNumber} />}
        <p style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 600, color: "#000", fontSize: "15px", lineHeight: "1.35" }}>{title}</p>
      </div>

      {/* Chart first */}
      <ScoresAcrossTurnsChart
        series={series}
        turnsData={turnsData}
        getScore={getScore}
        userScoresByTurn={userScoresByTurn}
      />

      <div className="space-y-5 mt-4">
        {series.map((s) => {
          const item = beliefs?.[s.key]
          const aiScore = typeof item?.score === "number" ? item.score : null
          const userScore = userBeliefs?.[s.key] ?? null
          const isLive = (liveBeliefs?.[s.key] ?? null) !== null

          return (
            <div key={s.key}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-zinc-700" style={{ fontSize: 13 }}>{s.label}</span>
                {isLoading && <span className="text-[9px] text-zinc-300 animate-pulse">updating…</span>}
              </div>
              {aiScore != null ? (
                <>
                  <div className="pr-9">
                    <DraggableScoreBar
                      aiScore={aiScore}
                      userScore={userScore}
                      color={s.color}
                      onChange={(score) => onUserScoreChange(s.key, score)}
                    />
                  </div>
                  {/* AI explanation — always visible with thumbs reaction buttons */}
                  {item?.explanation && (
                    <div className="flex items-start gap-1.5 mt-2">
                      <p className="leading-relaxed flex-1 text-zinc-500" style={{ fontSize: 12 }}>{item.explanation}</p>
                      <div className="flex gap-1 flex-shrink-0 mt-0.5">
                        <div className="relative group">
                          <button
                            onClick={() => toggleReaction(s.key, "up")}
                            className="w-5 h-5 flex items-center justify-center text-[11px] border transition-colors"
                            style={{ borderRadius: 3, borderColor: reactions?.[s.key] === "up" ? "#16a34a" : "#e4e4e7", backgroundColor: reactions?.[s.key] === "up" ? "#f0fdf4" : "#fff" }}
                          >👍</button>
                          <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 text-[12px] bg-zinc-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" style={{ fontFamily: "'Dosis', sans-serif" }}>
                            this is exactly what I think!
                            <div className="absolute top-full right-2 border-4 border-transparent border-t-zinc-800" />
                          </div>
                        </div>
                        <div className="relative group">
                          <button
                            onClick={() => toggleReaction(s.key, "down")}
                            className="w-5 h-5 flex items-center justify-center text-[11px] border transition-colors"
                            style={{ borderRadius: 3, borderColor: reactions?.[s.key] === "down" ? "#dc2626" : "#e4e4e7", backgroundColor: reactions?.[s.key] === "down" ? "#fef2f2" : "#fff" }}
                          >👎</button>
                          <div className="absolute bottom-full right-0 mb-1.5 px-2.5 py-1.5 text-[12px] bg-zinc-800 text-white rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10" style={{ fontFamily: "'Dosis', sans-serif" }}>
                            this is not a good assumption about me.
                            <div className="absolute top-full right-2 border-4 border-transparent border-t-zinc-800" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Confirm score + reason — single row, shown when user has dragged */}
                  {isLive && (
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        onClick={() => handleConfirm(s.key)}
                        className="flex-shrink-0 py-1 px-3 text-[11px] bg-white rounded"
                        style={{ border: `1.5px solid ${s.color}`, color: "#000", fontFamily: "'Dosis', sans-serif", fontWeight: 600 }}
                      >
                        Confirm score
                      </button>
                      <button
                        onClick={() => {
                          setReasons((prev) => { const n = { ...prev }; delete n[s.key]; return n })
                          onCancelDimension(s.key)
                        }}
                        title="Cancel change"
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center bg-white rounded text-red-500 font-bold text-[13px]"
                        style={{ border: "1.5px solid #fca5a5" }}
                      >✕</button>
                      <div className="relative flex-1">
                        <input
                          type="text"
                          className="w-full text-[11px] rounded border border-zinc-200 py-1.5 pl-2.5 pr-6 bg-white focus:outline-none focus:border-zinc-400"
                          style={{ fontFamily: "'Dosis', sans-serif" }}
                          placeholder="Why did you make this change?"
                          value={reasons[s.key] ?? ""}
                          onChange={(e) => setReasons((prev) => ({ ...prev, [s.key]: e.target.value }))}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleConfirm(s.key) } }}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-300 pointer-events-none select-none">↵</span>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="h-1.5 bg-zinc-100 rounded-full animate-pulse" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MentalModelsPanel({
  mentalModel, mentalModelsByTurn, isLoading,
  liveInductUser, liveTypesSupportUser,
  onInductChange, onTypesSupportChange,
  onInductConfirmDimension, onTypesSupportConfirmDimension,
  onInductCancelDimension, onTypesSupportCancelDimension,
  onInductReactionChange, onTypesSupportReactionChange,
  section1Ref, section2Ref,
}: {
  mentalModel: CombinedMentalModel | null
  mentalModelsByTurn: CombinedMentalModel[]
  isLoading: boolean
  liveInductUser: Record<string, number> | null
  liveTypesSupportUser: Record<string, number> | null
  onInductChange: (key: string, score: number) => void
  onTypesSupportChange: (key: string, score: number) => void
  onInductConfirmDimension: (key: string, reason: string) => void
  onTypesSupportConfirmDimension: (key: string, reason: string) => void
  onInductCancelDimension: (key: string) => void
  onTypesSupportCancelDimension: (key: string) => void
  onInductReactionChange: (key: string, dir: "up" | "down" | null) => void
  onTypesSupportReactionChange: (key: string, dir: "up" | "down" | null) => void
  section1Ref?: React.RefObject<HTMLDivElement | null>
  section2Ref?: React.RefObject<HTMLDivElement | null>
}) {
  if (!mentalModel && !isLoading) {
    return <p className="text-xs text-zinc-400 mt-2">Mental model will appear here after the first response.</p>
  }

  const inductBeliefs = mentalModel?.induct?.mental_model?.beliefs as
    | Record<string, { score: number; explanation?: string }> | undefined
  const supportBeliefs = mentalModel?.typesSupport?.mental_model?.support_seeking as
    | Record<string, { score: number; explanation?: string }> | undefined

  const lastIdx = mentalModelsByTurn.length - 1
  const lastMM = mentalModelsByTurn[lastIdx]

  // Merged user beliefs: committed scores + live overrides on top
  const mergedInductUser = (lastMM?.inductUser || liveInductUser)
    ? { ...(lastMM?.inductUser ?? {}), ...(liveInductUser ?? {}) }
    : null
  const mergedTypesSupportUser = (lastMM?.typesSupportUser || liveTypesSupportUser)
    ? { ...(lastMM?.typesSupportUser ?? {}), ...(liveTypesSupportUser ?? {}) }
    : null

  // Full per-turn arrays for chart
  const inductUserTurns = mentalModelsByTurn.map((mm, i) =>
    i === lastIdx
      ? (mergedInductUser ?? mm.inductUser ?? null)
      : (mm.inductUser ?? null)
  )
  const typesSupportUserTurns = mentalModelsByTurn.map((mm, i) =>
    i === lastIdx
      ? (mergedTypesSupportUser ?? mm.typesSupportUser ?? null)
      : (mm.typesSupportUser ?? null)
  )

  return (
    <div className="space-y-5 mt-2">
      <div ref={section1Ref}>
        <ScoreSection
          title="How much does the AI think you need validation vs. objectivity?"
          sectionNumber={1}
          series={INDUCT_SERIES as { key: string; label: string; color: string }[]}
          beliefs={inductBeliefs}
          userBeliefs={mergedInductUser}
          liveBeliefs={liveInductUser}
          reactions={lastMM?.inductUserReactions ?? null}
          turnsData={mentalModelsByTurn.map((mm) => mm.induct?.mental_model?.beliefs)}
          userScoresByTurn={inductUserTurns}
          getScore={(mm, key) => {
            const b = mm as Record<string, { score: number }> | undefined
            return typeof b?.[key]?.score === "number" ? b![key].score : null
          }}
          isLoading={isLoading}
          onUserScoreChange={onInductChange}
          onConfirmDimension={onInductConfirmDimension}
          onCancelDimension={onInductCancelDimension}
          onReactionChange={onInductReactionChange}
        />
      </div>
      <div className="border-t border-zinc-100" />
      <div ref={section2Ref}>
        <ScoreSection
          title="What kind of support does the AI think you're looking for?"
          sectionNumber={2}
          series={TYPES_SUPPORT_SERIES as { key: string; label: string; color: string }[]}
          beliefs={supportBeliefs}
          userBeliefs={mergedTypesSupportUser}
          liveBeliefs={liveTypesSupportUser}
          reactions={lastMM?.typesSupportUserReactions ?? null}
          turnsData={mentalModelsByTurn.map((mm) => mm.typesSupport?.mental_model?.support_seeking)}
          userScoresByTurn={typesSupportUserTurns}
          getScore={(mm, key) => {
            const b = mm as Record<string, { score: number }> | undefined
            return typeof b?.[key]?.score === "number" ? b![key].score : null
          }}
          isLoading={isLoading}
          onUserScoreChange={onTypesSupportChange}
          onConfirmDimension={onTypesSupportConfirmDimension}
          onCancelDimension={onTypesSupportCancelDimension}
          onReactionChange={onTypesSupportReactionChange}
        />
      </div>
    </div>
  )
}

// ─── Highlight popup ──────────────────────────────────────────────────────────

interface ActiveHighlight {
  text: string
  messageIndex: number
  anchorRect: { top: number; left: number; width: number; height: number }
}

function HighlightPopup({ active, onSave, onDismiss }: {
  active: ActiveHighlight
  onSave: (text: string, msgIdx: number, reaction: "up" | "down" | null, comment: string) => void
  onDismiss: () => void
}) {
  const [reaction, setReaction] = useState<"up" | "down" | null>(null)
  const [comment, setComment] = useState("")

  const handleSave = () => {
    if (!reaction && !comment.trim()) { onDismiss(); return }
    onSave(active.text, active.messageIndex, reaction, comment.trim())
    setReaction(null)
    setComment("")
  }

  const popupWidth = 260
  const { top, left, width, height } = active.anchorRect
  const posLeft = Math.max(8, Math.min((typeof window !== "undefined" ? window.innerWidth : 800) - popupWidth - 8, left + width / 2 - popupWidth / 2))
  const posTop = top < 140 ? top + height + 8 : top - 148

  return (
    <div
      className="fixed z-50 bg-white border border-zinc-200 rounded-xl shadow-xl p-3"
      style={{ width: popupWidth, top: posTop, left: posLeft, fontFamily: "'Dosis', sans-serif" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <p className="text-[11px] text-zinc-400 mb-2 leading-relaxed italic line-clamp-2">
        &ldquo;{active.text.length > 80 ? active.text.slice(0, 80) + "…" : active.text}&rdquo;
      </p>
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => setReaction((r) => r === "up" ? null : "up")}
          className="w-7 h-7 flex items-center justify-center text-base border transition-colors"
          style={{ borderRadius: 4, borderColor: reaction === "up" ? "#16a34a" : "#e4e4e7", backgroundColor: reaction === "up" ? "#f0fdf4" : "#fff" }}
        >👍</button>
        <button
          onClick={() => setReaction((r) => r === "down" ? null : "down")}
          className="w-7 h-7 flex items-center justify-center text-base border transition-colors"
          style={{ borderRadius: 4, borderColor: reaction === "down" ? "#dc2626" : "#e4e4e7", backgroundColor: reaction === "down" ? "#fef2f2" : "#fff" }}
        >👎</button>
        <span className="text-[10px] text-zinc-300 ml-auto select-none">highlight</span>
      </div>
      <div className="relative">
        <input
          type="text"
          autoFocus
          className="w-full text-[12px] rounded border border-zinc-200 py-1.5 pl-2.5 pr-7 focus:outline-none focus:border-zinc-400 bg-white"
          style={{ fontFamily: "'Dosis', sans-serif" }}
          placeholder="Add a comment…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleSave() }
            if (e.key === "Escape") onDismiss()
          }}
        />
        <button
          onClick={handleSave}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[12px] text-zinc-400 hover:text-zinc-700"
        >↵</button>
      </div>
    </div>
  )
}

// ─── Shared types ─────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant"
  content: string
  createdAt?: string | null
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChatIntervention() {
  const [alias, setAlias] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [streamingText, setStreamingText] = useState("")
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [lastFeedbackAt, setLastFeedbackAt] = useState(0)
  const [aliasTooltipDismissed, setAliasTooltipDismissed] = useState(false)
  const [aliasFocused, setAliasFocused] = useState(false)

  // ── Mental Models state ───────────────────────────────────────────────────
  const [mentalModel, setMentalModel] = useState<CombinedMentalModel | null>(null)
  const [mentalModelsByTurn, setMentalModelsByTurn] = useState<CombinedMentalModel[]>([])
  const [isLoadingMentalModel, setIsLoadingMentalModel] = useState(false)
  // Live slider state — updated on every drag tick for chart animation
  const [liveInductUser, setLiveInductUser] = useState<Record<string, number> | null>(null)
  const [liveTypesSupportUser, setLiveTypesSupportUser] = useState<Record<string, number> | null>(null)

  // Highlight / annotation state
  const [activeHighlight, setActiveHighlight] = useState<ActiveHighlight | null>(null)
  const [highlightsByMessage, setHighlightsByMessage] = useState<Record<number, number>>({})

  // Section scroll refs for panel navigation
  const section1Ref = useRef<HTMLDivElement>(null)
  const section2Ref = useRef<HTMLDivElement>(null)

  const aliasInputRef = useRef<HTMLInputElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()

  // Auto-resize textarea: 1 line default, grows to max 3 lines
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20
    const maxHeight = lineHeight * 3 + 20 // 3 lines + padding
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px"
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [])

  // ── Highlight / text-selection handlers ──────────────────────────────────

  const handleTextSelect = useCallback(() => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const text = selection.toString().trim()
    if (!text) return
    const range = selection.getRangeAt(0)
    let node: HTMLElement | null = range.commonAncestorContainer as HTMLElement
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement
    while (node && !node.dataset?.messageIndex) node = node.parentElement
    if (!node) return
    const msgIdx = parseInt(node.dataset.messageIndex!)
    const rect = range.getBoundingClientRect()
    setActiveHighlight({ text, messageIndex: msgIdx, anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height } })
  }, [])

  useEffect(() => {
    if (!activeHighlight) return
    const dismiss = () => setActiveHighlight(null)
    document.addEventListener("mousedown", dismiss)
    return () => document.removeEventListener("mousedown", dismiss)
  }, [activeHighlight])

  async function handleSaveHighlight(text: string, msgIdx: number, reaction: "up" | "down" | null, comment: string) {
    setActiveHighlight(null)
    window.getSelection()?.removeAllRanges()
    if (!activeConversationId) return
    await fetch(`/api/conversations/${activeConversationId}/highlights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageIndex: msgIdx, selectedText: text, reaction, comment }),
    }).catch(console.error)
    setHighlightsByMessage((prev) => ({ ...prev, [msgIdx]: (prev[msgIdx] ?? 0) + 1 }))
  }

  // ── User score dial handlers ──────────────────────────────────────────────

  function handleInductChange(key: string, score: number) {
    setLiveInductUser((prev) => {
      const base = prev ?? mentalModelsByTurn[mentalModelsByTurn.length - 1]?.inductUser ?? {}
      return { ...base, [key]: score }
    })
  }
  function handleTypesSupportChange(key: string, score: number) {
    setLiveTypesSupportUser((prev) => {
      const base = prev ?? mentalModelsByTurn[mentalModelsByTurn.length - 1]?.typesSupportUser ?? {}
      return { ...base, [key]: score }
    })
  }
  function handleInductConfirmDimension(key: string, reason: string) {
    const score = liveInductUser?.[key]
    if (score == null) return
    const turnIndex = mentalModelsByTurn.length - 1
    if (turnIndex < 0 || !activeConversationId) return
    const currentMM = mentalModelsByTurn[turnIndex]
    const newInductUser = { ...(currentMM.inductUser ?? {}), [key]: score }
    const newInductUserReasons = {
      ...(currentMM.inductUserReasons ?? {}),
      ...(reason ? { [key]: reason } : {}),
    }
    // Remove this key from live state
    setLiveInductUser((prev) => {
      if (!prev) return null
      const next = { ...prev }
      delete next[key]
      return Object.keys(next).length > 0 ? next : null
    })
    // Update committed state
    setMentalModelsByTurn((prev) => prev.map((mm, i) =>
      i === turnIndex ? { ...mm, inductUser: newInductUser, inductUserReasons: newInductUserReasons } : mm
    ))
    // Persist
    fetch(`/api/conversations/${activeConversationId}/mental-models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turnIndex,
        inductUser: newInductUser,
        typesSupportUser: currentMM.typesSupportUser ?? null,
        inductUserReasons: Object.keys(newInductUserReasons).length > 0 ? newInductUserReasons : null,
        typesSupportUserReasons: currentMM.typesSupportUserReasons ?? null,
      }),
    }).catch(console.error)
  }

  function handleInductCancelDimension(key: string) {
    setLiveInductUser((prev) => {
      if (!prev) return null
      const next = { ...prev }
      delete next[key]
      return Object.keys(next).length > 0 ? next : null
    })
  }

  function handleTypesSupportCancelDimension(key: string) {
    setLiveTypesSupportUser((prev) => {
      if (!prev) return null
      const next = { ...prev }
      delete next[key]
      return Object.keys(next).length > 0 ? next : null
    })
  }

  function handleInductReactionChange(key: string, dir: "up" | "down" | null) {
    const turnIndex = mentalModelsByTurn.length - 1
    if (turnIndex < 0 || !activeConversationId) return
    const currentMM = mentalModelsByTurn[turnIndex]
    const newReactions = dir == null
      ? (() => { const r = { ...(currentMM.inductUserReactions ?? {}) }; delete r[key]; return Object.keys(r).length > 0 ? r : null })()
      : { ...(currentMM.inductUserReactions ?? {}), [key]: dir }
    setMentalModelsByTurn((prev) => prev.map((mm, i) =>
      i === turnIndex ? { ...mm, inductUserReactions: newReactions } : mm
    ))
    fetch(`/api/conversations/${activeConversationId}/mental-models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turnIndex,
        inductUser: currentMM.inductUser ?? null,
        typesSupportUser: currentMM.typesSupportUser ?? null,
        inductUserReasons: currentMM.inductUserReasons ?? null,
        typesSupportUserReasons: currentMM.typesSupportUserReasons ?? null,
        inductUserReactions: newReactions,
        typesSupportUserReactions: currentMM.typesSupportUserReactions ?? null,
      }),
    }).catch(console.error)
  }

  function handleTypesSupportReactionChange(key: string, dir: "up" | "down" | null) {
    const turnIndex = mentalModelsByTurn.length - 1
    if (turnIndex < 0 || !activeConversationId) return
    const currentMM = mentalModelsByTurn[turnIndex]
    const newReactions = dir == null
      ? (() => { const r = { ...(currentMM.typesSupportUserReactions ?? {}) }; delete r[key]; return Object.keys(r).length > 0 ? r : null })()
      : { ...(currentMM.typesSupportUserReactions ?? {}), [key]: dir }
    setMentalModelsByTurn((prev) => prev.map((mm, i) =>
      i === turnIndex ? { ...mm, typesSupportUserReactions: newReactions } : mm
    ))
    fetch(`/api/conversations/${activeConversationId}/mental-models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turnIndex,
        inductUser: currentMM.inductUser ?? null,
        typesSupportUser: currentMM.typesSupportUser ?? null,
        inductUserReasons: currentMM.inductUserReasons ?? null,
        typesSupportUserReasons: currentMM.typesSupportUserReasons ?? null,
        inductUserReactions: currentMM.inductUserReactions ?? null,
        typesSupportUserReactions: newReactions,
      }),
    }).catch(console.error)
  }

  function handleTypesSupportConfirmDimension(key: string, reason: string) {
    const score = liveTypesSupportUser?.[key]
    if (score == null) return
    const turnIndex = mentalModelsByTurn.length - 1
    if (turnIndex < 0 || !activeConversationId) return
    const currentMM = mentalModelsByTurn[turnIndex]
    const newTypesSupportUser = { ...(currentMM.typesSupportUser ?? {}), [key]: score }
    const newTypesSupportUserReasons = {
      ...(currentMM.typesSupportUserReasons ?? {}),
      ...(reason ? { [key]: reason } : {}),
    }
    setLiveTypesSupportUser((prev) => {
      if (!prev) return null
      const next = { ...prev }
      delete next[key]
      return Object.keys(next).length > 0 ? next : null
    })
    setMentalModelsByTurn((prev) => prev.map((mm, i) =>
      i === turnIndex ? { ...mm, typesSupportUser: newTypesSupportUser, typesSupportUserReasons: newTypesSupportUserReasons } : mm
    ))
    fetch(`/api/conversations/${activeConversationId}/mental-models`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        turnIndex,
        inductUser: currentMM.inductUser ?? null,
        typesSupportUser: newTypesSupportUser,
        inductUserReasons: currentMM.inductUserReasons ?? null,
        typesSupportUserReasons: Object.keys(newTypesSupportUserReasons).length > 0 ? newTypesSupportUserReasons : null,
      }),
    }).catch(console.error)
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/session"),
      fetch("/api/conversations").then((r) => r.json()),
    ]).then(async ([sessionRes, convsData]) => {
      if (!sessionRes.ok) {
        router.replace(buildLoginRedirect("/chat-assumptions"))
        return
      }
      const sessionData = await sessionRes.json()
      setAlias(sessionData.alias)
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

  async function loadConversationMessages(conversationId: string) {
    if (activeConversationId && activeConversationId !== conversationId && messages.some((m) => m.role === "assistant")) {
      triggerSummarize(activeConversationId)
    }
    setLoadingConversation(true)
    setActiveConversationId(conversationId)
    setStreamingText("")

    const [messagesRes, mmRes, hlRes] = await Promise.all([
      fetch(`/api/conversations/${conversationId}/messages`),
      fetch(`/api/conversations/${conversationId}/mental-models`),
      fetch(`/api/conversations/${conversationId}/highlights`),
    ])
    const [messagesData, mmData, hlData] = await Promise.all([messagesRes.json(), mmRes.json(), hlRes.json()])

    // Restore highlight counts per message
    const hlCounts: Record<number, number> = {}
    for (const h of hlData.highlights ?? []) {
      hlCounts[h.messageIndex] = (hlCounts[h.messageIndex] ?? 0) + 1
    }
    setHighlightsByMessage(hlCounts)

    const rawMessages: Message[] = (messagesData.messages ?? []).map(
      ({ role, content, createdAt }: { role: string; content: string; createdAt?: string | null }) =>
        ({ role, content, createdAt })
    )
    setMessages(rawMessages)
    setLastFeedbackAt(rawMessages.filter((m) => m.role === "assistant").length)

    // Restore mental model history — sorted by turnIndex (includes user-confirmed scores)
    const mmRows: {
      turnIndex: number
      induct?: InductMentalModel
      typesSupport?: TypesSupportMentalModel
      inductUser?: Record<string, number> | null
      typesSupportUser?: Record<string, number> | null
      inductUserReasons?: Record<string, string> | null
      typesSupportUserReasons?: Record<string, string> | null
      inductUserReactions?: Record<string, "up" | "down"> | null
      typesSupportUserReactions?: Record<string, "up" | "down"> | null
    }[] = (mmData.mentalModels ?? []).sort((a: { turnIndex: number }, b: { turnIndex: number }) => a.turnIndex - b.turnIndex)
    const restored: CombinedMentalModel[] = mmRows.map((r) => ({
      induct: r.induct,
      typesSupport: r.typesSupport,
      inductUser: r.inductUser ?? null,
      typesSupportUser: r.typesSupportUser ?? null,
      inductUserReasons: r.inductUserReasons ?? null,
      typesSupportUserReasons: r.typesSupportUserReasons ?? null,
      inductUserReactions: r.inductUserReactions ?? null,
      typesSupportUserReactions: r.typesSupportUserReactions ?? null,
    }))
    setMentalModelsByTurn(restored)
    setMentalModel(restored.length > 0 ? restored[restored.length - 1] : null)

    setLoadingConversation(false)
  }

  function triggerSummarize(conversationId: string) {
    fetch(`/api/conversations/${conversationId}/summarize`, { method: "POST" }).catch(() => {})
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

  // ── handleSend ────────────────────────────────────────────────────────────

  async function handleSend() {
    if (!input.trim() || isLoading) return

    const question = input.trim()
    setInput("")
    setIsLoading(true)
    setIsLoadingMentalModel(true)

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

    const userMessage: Message = { role: "user", content: question }
    const newMessages = [...messages, userMessage]
    setMessages(newMessages)
    setStreamingText("")

    const apiMessages = newMessages.map(({ role, content }) => ({ role, content }))

    // Merge any live user adjustments into the last turn before sending
    const priorMMs = mentalModelsByTurn.map((mm, i) =>
      i === mentalModelsByTurn.length - 1
        ? {
            ...mm,
            inductUser: { ...(mm.inductUser ?? {}), ...(liveInductUser ?? {}) },
            typesSupportUser: { ...(mm.typesSupportUser ?? {}), ...(liveTypesSupportUser ?? {}) },
          }
        : mm
    )
    // Reset live scores for the upcoming new turn
    setLiveInductUser(null)
    setLiveTypesSupportUser(null)

    const res = await fetch("/api/intervention-chat", {
      method: "POST",
      body: JSON.stringify({
        messages: apiMessages,
        conversationId,
        priorMentalModels: priorMMs,
        userAdjustedMentalModels: priorMMs.map((mm) => ({ inductUser: mm.inductUser ?? null, typesSupportUser: mm.typesSupportUser ?? null })),
      }),
      headers: { "Content-Type": "application/json" },
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let accText = ""
    let lineBuffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      lineBuffer += decoder.decode(value, { stream: true })
      const lines = lineBuffer.split("\n")
      lineBuffer = lines.pop() ?? ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue
        let data: Record<string, unknown>
        try {
          data = JSON.parse(line.slice(6))
        } catch {
          continue
        }

        if (data.type === "text") {
          accText += data.text as string
          setStreamingText(accText)
        } else if (data.type === "mental_model") {
          const raw = data.data as { induct?: InductMentalModel; typesSupport?: TypesSupportMentalModel }
          const combined: CombinedMentalModel = { induct: raw.induct, typesSupport: raw.typesSupport }
          setMentalModel(combined)
          setMentalModelsByTurn((prev) => [...prev, combined])
          setIsLoadingMentalModel(false)
        } else if (data.type === "done") {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: accText, createdAt: new Date().toISOString() },
          ])
          setStreamingText("")
          setIsLoading(false)
          setIsLoadingMentalModel(false)
          if (conversationId) {
            const now = new Date().toISOString()
            setConversations((prev) => {
              const updated = prev.map((c) => c.id === conversationId ? { ...c, updatedAt: now } : c)
              return [updated.find((c) => c.id === conversationId)!, ...updated.filter((c) => c.id !== conversationId)]
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

  const showAliasTooltip = !alias && !aliasTooltipDismissed

  return (
    <div className="flex flex-col h-screen bg-zinc-50 font-roboto">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-200 z-10">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-zinc-900">AI Assumptions Dial</span>
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
              onBlur={(e) => { setAliasFocused(false); handleAliasUpdate(e.target.value) }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aliasInputRef.current?.blur() } }}
            />
            {aliasFocused && (
              <button
                onMouseDown={(e) => { e.preventDefault(); aliasInputRef.current?.blur() }}
                className="absolute right-1.5 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 bg-zinc-100 hover:bg-zinc-200 rounded transition-colors"
              >
                Done
              </button>
            )}
          </div>
          <button
            onClick={async () => { await fetch("/api/logout", { method: "POST" }); router.push("/login") }}
            className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      {/* Main layout — chat + right panel only, no sidebar */}
      <div className="flex flex-1 overflow-hidden">

        {/* Chat */}
        <div className="flex flex-col flex-1 border-r border-zinc-200 min-w-0">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" onMouseUp={handleTextSelect}>
            {loadingConversation ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-zinc-400">Loading...</p>
              </div>
            ) : messages.length === 0 && !streamingText && !isLoading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-zinc-400">Start a conversation...</p>
              </div>
            ) : null}

            {/* Messages */}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "user" ? (
                  <div
                    className="max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed text-zinc-900"
                    data-message-index={i}
                    style={{
                      background: [
                        "radial-gradient(circle, #ffd1e9 1px, transparent 1.5px) 12% 22% / 4px 4px no-repeat",
                        "radial-gradient(circle, #ffd1e9 0.8px, transparent 1.2px) 78% 11% / 3px 3px no-repeat",
                        "radial-gradient(circle, #ffd1e9 1px, transparent 1.5px) 88% 68% / 4px 4px no-repeat",
                        "radial-gradient(circle, #ffd1e9 0.8px, transparent 1.2px) 34% 81% / 3px 3px no-repeat",
                        "radial-gradient(circle, #ffd1e9 1px, transparent 1.5px) 6% 57% / 4px 4px no-repeat",
                        "radial-gradient(circle, #ffd1e9 0.8px, transparent 1.2px) 61% 44% / 3px 3px no-repeat",
                        "radial-gradient(circle, #ffd1e9 1px, transparent 1.5px) 92% 29% / 4px 4px no-repeat",
                        "radial-gradient(circle, #ffd1e9 0.8px, transparent 1.2px) 47% 7% / 3px 3px no-repeat",
                        "radial-gradient(circle, #ffd1e9 1px, transparent 1.5px) 23% 63% / 4px 4px no-repeat",
                        "radial-gradient(circle, #ffd1e9 0.8px, transparent 1.2px) 71% 88% / 3px 3px no-repeat",
                        "#ffedd1",
                      ].join(", "),
                    }}
                  >
                    {msg.content}
                  </div>
                ) : (
                  <div className="max-w-[80%] flex flex-col gap-1" data-message-index={i}>
                    <div className="px-4 py-2.5 text-zinc-900 text-sm leading-relaxed">
                      <MarkdownText content={msg.content} />
                    </div>
                    <div className="flex items-center gap-3 px-1">
                      {msg.createdAt && (
                        <span className="text-[10px] text-zinc-400">
                          {new Date(msg.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {highlightsByMessage[i] ? (
                        <span className="text-[10px] text-zinc-400 flex items-center gap-1">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          {highlightsByMessage[i]}
                        </span>
                      ) : null}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[80%] px-4 py-2.5 text-zinc-900 text-sm leading-relaxed">
                  <MarkdownText content={streamingText} />
                  <span className="inline-block w-1 h-3 bg-zinc-400 ml-0.5 animate-pulse" />
                </div>
              </div>
            )}
            {isLoading && !streamingText && messages.length > 0 && (
              <div className="flex justify-start">
                <div className="px-4 py-2.5">
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
                ref={textareaRef}
                className="flex-1 resize-none border border-zinc-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-zinc-900 leading-relaxed"
                placeholder="Type a message..."
                rows={1}
                value={input}
                onChange={(e) => { setInput(e.target.value); resizeTextarea() }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault()
                    handleSend()
                    if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.overflowY = "hidden" }
                  }
                }}
              />
              <button
                onClick={() => { handleSend(); if (textareaRef.current) { textareaRef.current.style.height = "auto"; textareaRef.current.style.overflowY = "hidden" } }}
                disabled={isLoading || !input.trim()}
                className="p-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-40 flex items-center justify-center self-end"
                aria-label="Send"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right panel — Mental Models only */}
        <div className="flex flex-col flex-shrink-0 overflow-hidden border-l border-zinc-200" style={{ width: "45%" }}>
          {/* Dosis font */}
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Dosis:wght@200..800&display=swap');`}</style>

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-zinc-200 flex-shrink-0">
            <span style={{ fontFamily: "'Dosis', sans-serif", fontWeight: 600, color: "#000", fontSize: "16px", lineHeight: "1.35" }}>
              What does the AI assume about you<br />when answering your question?
            </span>
            <div className="flex items-center gap-2 ml-3 flex-shrink-0">
              {isLoadingMentalModel && (
                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
              )}
              {/* Review tooltip */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-zinc-900 border border-zinc-200 rounded-lg bg-white whitespace-nowrap shadow-sm" style={{ fontFamily: "'Dosis', sans-serif" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: "#fc5432" }} />
                Make sure to review both of them →
              </div>
              {/* Section nav */}
              <button
                onClick={() => section1Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, backgroundColor: "#18181b", color: "#fff", fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none" }}
              >1</button>
              <button
                onClick={() => section2Ref.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 22, height: 22, borderRadius: 6, backgroundColor: "#18181b", color: "#fff", fontFamily: "'Dosis', sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer", border: "none" }}
              >2</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <p className="text-[10px] text-zinc-400 leading-relaxed mb-3">
              Updated after each response, based on what you said.
            </p>
            <MentalModelsPanel
              mentalModel={mentalModel}
              mentalModelsByTurn={mentalModelsByTurn}
              isLoading={isLoadingMentalModel}
              liveInductUser={liveInductUser}
              liveTypesSupportUser={liveTypesSupportUser}
              onInductChange={handleInductChange}
              onTypesSupportChange={handleTypesSupportChange}
            onInductConfirmDimension={handleInductConfirmDimension}
            onTypesSupportConfirmDimension={handleTypesSupportConfirmDimension}
            onInductCancelDimension={handleInductCancelDimension}
            onTypesSupportCancelDimension={handleTypesSupportCancelDimension}
            onInductReactionChange={handleInductReactionChange}
              onTypesSupportReactionChange={handleTypesSupportReactionChange}
              section1Ref={section1Ref}
              section2Ref={section2Ref}
            />
          </div>

        </div>
      </div>

      {/* Highlight popup — rendered outside scroll container so it stays fixed */}
      {activeHighlight && (
        <HighlightPopup
          active={activeHighlight}
          onSave={handleSaveHighlight}
          onDismiss={() => setActiveHighlight(null)}
        />
      )}
    </div>
  )
}
