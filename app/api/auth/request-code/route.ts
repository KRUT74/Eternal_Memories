import { z } from "zod"
import { EmailSchema, requestCode } from "@/lib/server/accounts"
import { env } from "@/lib/server/env"
import { ipHash } from "@/lib/server/session"

const RequestSchema = z.object({ email: EmailSchema })

/**
 * Emails a sign-in code. The success response is identical whether or not the
 * address already has an account, so this can't be used to discover who signed up.
 */
export async function POST(req: Request) {
  if (!env.emailSignInEnabled) {
    return Response.json({ error: "Email sign-in isn't available yet. You can try it as a guest." }, { status: 503 })
  }
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Please enter a valid email address." }, { status: 400 })

  const result = await requestCode(parsed.data.email, ipHash(req))
  if (!result.ok && result.reason === "rate_limited") {
    return Response.json(
      { error: "Too many codes requested. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": "900" } },
    )
  }
  if (!result.ok) {
    return Response.json({ error: "We couldn't send the email just now. Please try again shortly." }, { status: 502 })
  }
  return Response.json({ sent: true, message: "If that address is valid, a code is on its way." })
}
