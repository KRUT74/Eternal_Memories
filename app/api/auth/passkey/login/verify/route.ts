import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import { mergeGuestInto } from "@/lib/server/accounts"
import { env } from "@/lib/server/env"
import { relyingParty, verifyLogin } from "@/lib/server/passkeys"
import { getSession, startAccountSession } from "@/lib/server/session"

const MESSAGES = {
  unknown: "This face sign-in isn't linked to an account any more. Please sign in with your email.",
  failed: "Face sign-in didn't work. Please try again, or use your email.",
} as const

/** Finishes signing in by face, keeping a guest's memories if they had any. */
export async function POST(req: Request) {
  if (!env.passkeysEnabled) return Response.json({ error: "Face sign-in isn't available yet." }, { status: 503 })
  const rp = relyingParty(req)
  const body = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null
  if (!rp || !body || typeof body.id !== "string") {
    return Response.json({ error: MESSAGES.failed, reason: "failed" }, { status: 400 })
  }

  const result = await verifyLogin(body, rp)
  if (!result.ok) return Response.json({ error: MESSAGES[result.reason], reason: result.reason }, { status: 400 })

  const current = await getSession()
  if (current?.kind === "guest") await mergeGuestInto(current.userId, result.account.id)
  const session = await startAccountSession(result.account)
  return Response.json({ name: session.name, email: session.email })
}
