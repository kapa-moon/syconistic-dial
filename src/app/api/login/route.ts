import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { participants, sessions } from "@/lib/schema"

export async function POST(req: Request) {
  let body: {
    participantId?: string
    alias?: string
    prolificStudyId?: string
    prolificSessionId?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
  }

  const { participantId, alias, prolificStudyId, prolificSessionId } = body

  if (!participantId) {
    return NextResponse.json({ error: "participantId required" }, { status: 400 })
  }

  try {
    // Upsert participant: create on first visit, return existing on return visits
    let participant = await db.query.participants.findFirst({
      where: eq(participants.id, participantId),
    })

    if (!participant) {
      const [created] = await db
        .insert(participants)
        .values({ id: participantId, alias: alias ?? "" })
        .returning()
      participant = created
    }

    const persistedAlias = participant.alias ?? ""
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    await db.insert(sessions).values({
      participantId: participant.id,
      alias: persistedAlias,
      expiresAt,
      prolificStudyId: prolificStudyId ?? null,
      prolificSessionId: prolificSessionId ?? null,
    })

    const cookieStore = await cookies()
    cookieStore.set("participant_id", participant.id, {
      expires: expiresAt,
      httpOnly: true,
    })

    return NextResponse.json({ alias: persistedAlias })
  } catch (err) {
    console.error("Login error:", err)
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    )
  }
}
