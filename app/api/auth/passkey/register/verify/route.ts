import type { RegistrationResponseJSON } from "@simplewebauthn/server"
import { env } from "@/lib/server/env"
import { deviceLabel, registerPasskey, relyingParty } from "@/lib/server/passkeys"
import { getSession, unauthorized } from "@/lib/server/session"

/** Finishes setting up face sign-in: checks the new passkey and saves its public key. */
export async function POST(req: Request) {
  if (!env.passkeysEnabled) return Response.json({ error: "Face sign-in isn't available yet." }, { status: 503 })
  const session = await getSession()
  if (!session || session.kind !== "email") return unauthorized()
  const rp = relyingParty(req)
  const body = (await req.json().catch(() => null)) as RegistrationResponseJSON | null
  if (!rp || !body || typeof body.id !== "string") {
    return Response.json({ error: "Face sign-in couldn't be set up. Please try again." }, { status: 400 })
  }

  const passkey = await registerPasskey(session.userId, body, rp, deviceLabel(req.headers.get("user-agent")))
  if (!passkey) return Response.json({ error: "Face sign-in couldn't be set up. Please try again." }, { status: 400 })
  return Response.json({ passkey })
}
