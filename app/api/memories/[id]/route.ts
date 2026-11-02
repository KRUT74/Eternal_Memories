import { z } from "zod"
import { forgetMemory, setPinned } from "@/lib/server/memory"
import { getSession, unauthorized } from "@/lib/server/session"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 })

  try {
    // Scoped to the session's user, so another visitor's memory ID simply isn't found.
    const deleted = await forgetMemory(session.userId, id)
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    console.error("Forgetting memory failed", error)
    return Response.json({ error: "Could not forget that memory" }, { status: 500 })
  }
}

const PinSchema = z.object({ pinned: z.boolean() })

/** Pins a memory ("always remember this") or unpins it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) return unauthorized()

  const { id } = await params
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 })
  const parsed = PinSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Expected { pinned: boolean }" }, { status: 400 })

  try {
    const memory = await setPinned(session.userId, id, parsed.data.pinned)
    return memory ? Response.json({ memory }) : Response.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    console.error("Pinning memory failed", error)
    return Response.json({ error: "Could not update that memory" }, { status: 500 })
  }
}
