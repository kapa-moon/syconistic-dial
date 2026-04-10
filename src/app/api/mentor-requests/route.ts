import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, desc } from "drizzle-orm"
import { db } from "@/lib/db"
import { mentorRequests } from "@/lib/schema"

export async function GET() {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const requests = await db.query.mentorRequests.findMany({
    where: eq(mentorRequests.participantId, participantId),
    orderBy: desc(mentorRequests.createdAt),
  })

  return NextResponse.json({ requests })
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const { content, editorSnapshot } = body as { content: string; editorSnapshot?: string }

  if (!content?.trim()) {
    return NextResponse.json({ error: "Content required" }, { status: 400 })
  }

  const [created] = await db
    .insert(mentorRequests)
    .values({
      participantId,
      content: content.trim(),
      editorSnapshot: editorSnapshot ?? null,
    })
    .returning()

  return NextResponse.json({ request: created })
}
