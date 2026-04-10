"use client"
import { useEffect, useState } from "react"
import Link from "next/link"

interface Option {
  title: string
  href: string
  available: boolean
  badge?: string
}

const OPTIONS: Option[] = [
  {
    title: "Chat Interface",
    href: "/chat-default",
    available: true,
  },
  {
    title: "Chat Interface, Reasoning",
    href: "/chat-reasoning",
    available: true,
  },
  {
    title: "Chat Interface, AI Assumptions",
    href: "/chat-assumptions",
    available: true,
  },
  {
    title: "Intervention Interface",
    href: "/chat-awareness",
    available: false,
    badge: "Coming soon",
  },
  {
    title: "I (don't) need AI",
    href: "/mentor-letter",
    available: true,
  },
]

export default function HomePage() {
  const [alias, setAlias] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (data?.alias) setAlias(data.alias) })
      .catch(() => {})
  }, [])

  void alias

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-8">
      <div className="flex w-full max-w-5xl gap-4">
        {OPTIONS.map((opt, i) => (
          <OptionCard key={i} option={opt} />
        ))}
      </div>
    </div>
  )
}

function OptionCard({ option }: { option: Option }) {
  const base = "group flex flex-col flex-1 border px-5 py-6 transition-all"

  if (!option.available) {
    return (
      <div className={`${base} border-zinc-100 bg-zinc-50 cursor-not-allowed opacity-50`}>
        <span className="text-xs font-medium text-zinc-400 leading-snug">{option.title}</span>
        {option.badge && (
          <span className="mt-2 self-start rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400">
            {option.badge}
          </span>
        )}
      </div>
    )
  }

  return (
    <Link
      href={option.href}
      className={`${base} border-zinc-200 bg-white hover:border-zinc-900 hover:shadow-sm`}
    >
      <span className="text-xs font-medium text-zinc-900 leading-snug">{option.title}</span>
    </Link>
  )
}

