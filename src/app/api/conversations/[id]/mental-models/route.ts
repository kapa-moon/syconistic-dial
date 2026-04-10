import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { eq, asc, and } from "drizzle-orm"
import { db } from "@/lib/db"
import { conversations, mentalModels } from "@/lib/schema"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const participantId = cookieStore.get("participant_id")?.value

  if (!participantId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
  })

  if (!conv || conv.participantId !== participantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const rows = await db.query.mentalModels.findMany({
    where: eq(mentalModels.conversationId, id),
    orderBy: asc(mentalModels.turnIndex),
  })

  return NextResponse.json({
    mentalModels: rows.map((r) => ({
      turnIndex: r.turnIndex,
      induct: r.inductData ?? null,
      typesSupport: r.typesSupportData ?? null,
      inductUser: r.inductUserData ?? null,
      typesSupportUser: r.typesSupportUserData ?? null,
      inductUserReasons: r.inductUserReasons ?? null,
      typesSupportUserReasons: r.typesSupportUserReasons ?? null,
      inductUserReactions: r.inductUserReactions ?? null,
      typesSupportUserReactions: r.typesSupportUserReactions ?? null,
    })),
  })
}

// PATCH — save user-adjusted scores for a specific turn
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

  const conv = await db.query.conversations.findFirst({
    where: eq(conversations.id, id),
  })

  if (!conv || conv.participantId !== participantId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { turnIndex, inductUser, typesSupportUser, inductUserReasons, typesSupportUserReasons, inductUserReactions, typesSupportUserReactions } = await req.json()

  await db
    .update(mentalModels)
    .set({
      inductUserData: inductUser ?? null,
      typesSupportUserData: typesSupportUser ?? null,
      inductUserReasons: inductUserReasons ?? null,
      typesSupportUserReasons: typesSupportUserReasons ?? null,
      inductUserReactions: inductUserReactions ?? null,
      typesSupportUserReactions: typesSupportUserReactions ?? null,
    })
    .where(
      and(
        eq(mentalModels.conversationId, id),
        eq(mentalModels.turnIndex, turnIndex)
      )
    )

  return NextResponse.json({ ok: true })
}
