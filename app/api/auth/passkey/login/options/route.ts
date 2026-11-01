import { env } from "@/lib/server/env"
import { loginOptions, relyingParty } from "@/lib/server/passkeys"
import { ipHash } from "@/lib/server/session"

/** Starts signing in by face. */
export async function POST(req: Request) {
  if (!env.passkeysEnabled) return Response.json({ error: "Face sign-in isn't available yet." }, { status: 503 })
  const rp = relyingParty(req)
  if (!rp) return Response.json({ error: "Face sign-in isn't available on this address." }, { status: 400 })
  const options = await loginOptions(rp.rpID, ipHash(req))
  if (!options) {
    return Response.json(
      { error: "Too many sign-in attempts. Please wait a while, or use your email." },
      { status: 429, headers: { "Retry-After": "3600" } },
    )
  }
  return Response.json(options)
}
