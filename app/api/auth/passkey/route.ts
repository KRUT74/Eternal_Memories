import { z } from "zod"
import { env } from "@/lib/server/env"
import { listPasskeys, removePasskey } from "@/lib/server/passkeys"
import { getSession, unauthorized } from "@/lib/server/session"

const RemoveSchema = z.object({ id: z.string().min(1).max(1024) })

/** The signed-in account's face sign-in passkeys, for the account menu. */
export async function GET() {
  if (!env.passkeysEnabled) return Response.json({ enabled: false, passkeys: [] })
  const session = await getSession()
  if (!session) return unauthorized()
  if (session.kind !== "email") return Response.json({ enabled: true, passkeys: [] })
  return Response.json({ enabled: true, passkeys: await listPasskeys(session.userId) })
}

/** Turns face sign-in off for one device. */
export async function DELETE(req: Request) {
  const session = await getSession()
  if (!session || session.kind !== "email") return unauthorized()
  const parsed = RemoveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Missing passkey ID." }, { status: 400 })
  const removed = await removePasskey(session.userId, parsed.data.id)
  return removed ? new Response(null, { status: 204 }) : Response.json({ error: "Not found." }, { status: 404 })
}
