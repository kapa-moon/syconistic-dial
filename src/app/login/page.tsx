"use client"
import { useState, useEffect, useRef, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"

function LoginForm() {
  const [participantId, setParticipantId] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoSubmittedRef = useRef(false)

  const prolificPid    = searchParams.get("PROLIFIC_PID") ?? ""
  const prolificStudyId   = searchParams.get("STUDY_ID") ?? ""
  const prolificSessionId = searchParams.get("SESSION_ID") ?? ""
  const redirectTo     = searchParams.get("redirect") || "/home"
  const fromProlific   = Boolean(prolificPid)

  // Pre-fill and auto-submit when arriving from Prolific
  useEffect(() => {
    if (prolificPid && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true
      setParticipantId(prolificPid)
      handleLogin(prolificPid, prolificStudyId, prolificSessionId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prolificPid])

  async function handleLogin(
    pid = participantId,
    studyId = "",
    sessionId = ""
  ) {
    if (!pid.trim()) return
    setError("")
    setLoading(true)

    const body: Record<string, string> = { participantId: pid.trim() }
    if (studyId) body.prolificStudyId = studyId
    if (sessionId) body.prolificSessionId = sessionId

    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    })

    let data: { error?: string } = {}
    const contentType = res.headers.get("content-type")
    if (contentType?.includes("application/json")) {
      try { data = await res.json() } catch {
        setError("Something went wrong. Please try again.")
        setLoading(false)
        return
      }
    } else if (!res.ok) {
      setError("Something went wrong. Please try again.")
      setLoading(false)
      return
    }

    if (res.ok) {
      router.push(redirectTo)
    } else {
      setError(data.error ?? "Invalid participant ID")
      setLoading(false)
    }
  }

  if (fromProlific && !error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
          <p className="text-sm text-zinc-500">Signing you in…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col gap-4 w-80">
        <div className="mb-2">
          <h1 className="text-2xl font-semibold text-zinc-900">Welcome</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Enter your Prolific participant ID to continue.
          </p>
        </div>
        <input
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:border-transparent"
          placeholder="Prolific participant ID"
          value={participantId}
          onChange={(e) => setParticipantId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
          disabled={loading}
          autoFocus
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          className="bg-zinc-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
          onClick={() => handleLogin()}
          disabled={loading || !participantId.trim()}
        >
          {loading ? "Signing in…" : "Enter"}
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
