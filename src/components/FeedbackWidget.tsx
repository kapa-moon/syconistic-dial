"use client"
import { useState } from "react"

function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill={filled ? "#ff5d54" : "none"}
      stroke={filled ? "#ff5d54" : "#d1d5db"}
      strokeWidth="1.6"
      strokeLinejoin="round"
    >
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  )
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill={filled ? "#ffcf54" : "none"}
      stroke={filled ? "#ffcf54" : "#d1d5db"}
      strokeWidth="1.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

interface FeedbackWidgetProps {
  onSubmit: (feelingScore: number, helpfulnessScore: number) => void
}

export function FeedbackWidget({ onSubmit }: FeedbackWidgetProps) {
  const [feelingScore, setFeelingScore] = useState(0)
  const [helpfulnessScore, setHelpfulnessScore] = useState(0)
  const [feelingHover, setFeelingHover] = useState(0)
  const [helpHover, setHelpHover] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  function handleHeartClick(v: number) {
    setFeelingScore(v)
    if (helpfulnessScore > 0) triggerSubmit(v, helpfulnessScore)
  }

  function handleStarClick(v: number) {
    setHelpfulnessScore(v)
    if (feelingScore > 0) triggerSubmit(feelingScore, v)
  }

  function triggerSubmit(f: number, h: number) {
    setSubmitted(true)
    setTimeout(() => onSubmit(f, h), 350)
  }

  if (submitted) {
    return (
      <div className="flex justify-center py-2">
        <div className="px-4 py-2 rounded-xl bg-zinc-50 border border-zinc-100 text-xs text-zinc-400">
          Thanks for your feedback!
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-5 px-5 py-3 rounded-2xl bg-white border border-zinc-100 shadow-sm">
        {/* Feeling */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[11px] text-zinc-400 font-medium">How are you feeling?</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onMouseEnter={() => setFeelingHover(v)}
                onMouseLeave={() => setFeelingHover(0)}
                onClick={() => handleHeartClick(v)}
                className="transition-transform duration-100 hover:scale-115 active:scale-95 outline-none"
                aria-label={`Feeling ${v}`}
              >
                <HeartIcon filled={(feelingHover || feelingScore) >= v} />
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-10 bg-zinc-100" />

        {/* Helpfulness */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-[11px] text-zinc-400 font-medium">Was this helpful?</span>
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onMouseEnter={() => setHelpHover(v)}
                onMouseLeave={() => setHelpHover(0)}
                onClick={() => handleStarClick(v)}
                className="transition-transform duration-100 hover:scale-115 active:scale-95 outline-none"
                aria-label={`Helpfulness ${v}`}
              >
                <StarIcon filled={(helpHover || helpfulnessScore) >= v} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
