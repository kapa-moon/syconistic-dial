"use client"
import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { buildLoginRedirect } from "@/lib/auth"

export default function ChatReasoningPage() {
  const router = useRouter()

  useEffect(() => {
    fetch("/api/session").then((res) => {
      if (!res.ok) {
        router.replace(buildLoginRedirect("/chat-reasoning"))
      } else {
        router.replace("/dashboard")
      }
    })
  }, [router])

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
    </div>
  )
}
