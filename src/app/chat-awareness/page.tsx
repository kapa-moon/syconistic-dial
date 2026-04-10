"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { buildLoginRedirect } from "@/lib/auth"

export default function ChatAwarenessPage() {
  const router = useRouter()

  useEffect(() => {
    fetch("/api/session").then((res) => {
      if (!res.ok) router.replace(buildLoginRedirect("/chat-awareness"))
    })
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 bg-white">
      <div className="w-full max-w-sm text-center">
        <div className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-zinc-400"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 mb-2">Intervention Interface</h1>
        <p className="text-sm text-zinc-500 mb-8">
          This interface is currently under development and will be available soon.
        </p>
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-900 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back to home
        </Link>
      </div>
    </div>
  )
}
