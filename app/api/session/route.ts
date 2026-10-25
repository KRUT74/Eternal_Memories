import { z } from "zod"
import { deleteAllUserData } from "@/lib/server/memory"
import { endSession, getSession, ipHash, renameSession, startSession, unauthorized } from "@/lib/server/session"
import { checkSessionAllowed, limitResponse, recordUsage, remainingToday } from "@/lib/server/usage"

const NameSchema = z.object({ name: z.string().trim().min(1).max(40) })

/** Who am I? Returns the visitor's name and how many messages they have left today. */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()
  return Response.json({ name: session.name, remainingToday: await remainingToday(session.userId, ipHash(req)) })
}

/** Starts a session for a new visitor, or renames the current one. */
export async function POST(req: Request) {
  const parsed = NameSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Please enter a name (up to 40 characters)." }, { status: 400 })

  const existing = await getSession()
  if (existing) {
    const session = await renameSession(existing, parsed.data.name)
    return Response.json({ name: session.name })
  }

  const ip = ipHash(req)
  const check = await checkSessionAllowed(ip)
  if (!check.ok) return limitResponse(check)

  const session = await startSession(parsed.data.name)
  await recordUsage("session", session.userId, ip)
  return Response.json({ name: session.name }, { status: 201 })
}

/** "Forget everything": deletes the visitor's messages and memories and clears the cookie. */
export async function DELETE() {
  const session = await getSession()
  if (!session) return unauthorized()
  await deleteAllUserData(session.userId)
  await endSession()
  return new Response(null, { status: 204 })
}
