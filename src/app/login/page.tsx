"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [participantId, setParticipantId] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  async function handleLogin() {
    setError("")
    const res = await fetch("/api/login", {
      method: "POST",
      body: JSON.stringify({ participantId }),
      headers: { "Content-Type": "application/json" }
    })
    let data: { error?: string } = {}
    const contentType = res.headers.get("content-type")
    if (contentType?.includes("application/json")) {
      try {
        data = await res.json()
      } catch {
        setError("Something went wrong. Please try again.")
        return
      }
    } else if (!res.ok) {
      setError("Something went wrong. Please try again.")
      return
    }
    if (res.ok) {
      router.push("/dashboard")
    } else {
      setError(data.error ?? "Invalid participant ID")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="flex flex-col gap-4 w-80">
        <h1 className="text-2xl font-semibold">Welcome</h1>
        <input
          className="border rounded px-3 py-2"
          placeholder="Enter your participant ID"
          value={participantId}
          onChange={e => setParticipantId(e.target.value)}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          className="bg-black text-white rounded px-4 py-2"
          onClick={handleLogin}
        >
          Enter
        </button>
      </div>
    </div>
  )
}