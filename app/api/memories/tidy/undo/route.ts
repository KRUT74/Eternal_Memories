import { z } from "zod"
import { getSession, unauthorized } from "@/lib/server/session"
import { undoTidyChange } from "@/lib/server/tidy"

const UndoSchema = z.object({ runId: z.uuid(), index: z.number().int().min(0).max(1000) })

/** Reverses one change from a tidy-up: restores merged or retired memories, or reverts an edit. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()
  const parsed = UndoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Expected { runId, index }" }, { status: 400 })

  try {
    const undone = await undoTidyChange(session.userId, parsed.data.runId, parsed.data.index)
    return undone ? new Response(null, { status: 204 }) : Response.json({ error: "Nothing to undo" }, { status: 404 })
  } catch (error) {
    console.error("Undoing tidy-up change failed", error)
    return Response.json({ error: "Couldn't undo that change" }, { status: 500 })
  }
}
