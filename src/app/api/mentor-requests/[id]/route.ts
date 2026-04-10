import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { mentorRequests } from "@/lib/schema"

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json()
  const { resolved } = body as { resolved: number }

  const [updated] = await db
    .update(mentorRequests)
    .set({
      resolved,
      resolvedAt: resolved ? new Date() : null,
    })
    .where(and(eq(mentorRequests.id, id), eq(mentorRequests.participantId, participantId)))
    .returning()

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ request: updated })
}
