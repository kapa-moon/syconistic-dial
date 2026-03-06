import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { sessions } from "@/lib/schema"

export async function GET() {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.participantId, participantId),
    orderBy: desc(sessions.loginAt),
  })

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  return NextResponse.json({
    alias: session.alias,
    sycophancyScore: session.sycophancyScore,
  })
}

export async function PATCH(req: Request) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { sycophancyScore, alias } = body as {
    sycophancyScore?: number
    alias?: string
  }

  const session = await db.query.sessions.findFirst({
    where: eq(sessions.participantId, participantId),
    orderBy: desc(sessions.loginAt),
  })

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 })
  }

  const updateData: Partial<typeof sessions.$inferInsert> = {}

  if (typeof sycophancyScore === "number") {
    updateData.sycophancyScore = sycophancyScore
  }

  if (typeof alias === "string") {
    updateData.alias = alias
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
  }

  await db.update(sessions)
    .set(updateData)
    .where(eq(sessions.id, session.id))

  return NextResponse.json({ success: true })
}