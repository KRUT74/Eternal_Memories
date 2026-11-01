import { env } from "@/lib/server/env"
import { registrationOptions, relyingParty } from "@/lib/server/passkeys"
import { getSession, ipHash, unauthorized } from "@/lib/server/session"

/** Starts setting up face sign-in. Email accounts only: a passkey needs an account to belong to. */
export async function POST(req: Request) {
  if (!env.passkeysEnabled) return Response.json({ error: "Face sign-in isn't available yet." }, { status: 503 })
  const session = await getSession()
  if (!session) return unauthorized()
  if (session.kind !== "email") {
    return Response.json({ error: "Save your memories with email first, then you can add face sign-in." }, { status: 403 })
  }
  const rp = relyingParty(req)
  if (!rp) return Response.json({ error: "Face sign-in isn't available on this address." }, { status: 400 })

  const options = await registrationOptions(session.userId, rp.rpID, ipHash(req))
  if (!options) return Response.json({ error: "Too many tries. Please wait a while and try again." }, { status: 429 })
  return Response.json(options)
}
