import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { feedbackRatings } from "@/lib/schema"

export async function POST(req: NextRequest) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value
  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { feelingScore, helpfulnessScore, conversationId } = await req.json()

  await db.insert(feedbackRatings).values({
    participantId,
    conversationId: conversationId ?? null,
    feelingScore,
    helpfulnessScore,
  })

  return NextResponse.json({ ok: true })
}
