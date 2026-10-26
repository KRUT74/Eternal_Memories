import { z } from "zod"
import { EmailSchema, mergeGuestInto, verifyCode } from "@/lib/server/accounts"
import { env } from "@/lib/server/env"
import { getSession, startAccountSession } from "@/lib/server/session"

const RequestSchema = z.object({
  email: EmailSchema,
  code: z.string().trim().regex(/^\d{6}$/),
  name: z.string().trim().min(1).max(40).optional(),
})

const MESSAGES = {
  invalid: "That code isn't right. Check the email and try again.",
  too_many: "Too many wrong tries. Request a new code.",
  expired: "That code has expired. Request a new one.",
  none: "There's no active code for that address. Request a new one.",
} as const

/** Checks the emailed code and signs in, keeping a guest's memories if they had any. */
export async function POST(req: Request) {
  if (!env.emailSignInEnabled) {
    return Response.json({ error: "Email sign-in isn't available yet." }, { status: 503 })
  }
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Enter the 6-digit code from the email." }, { status: 400 })
  const { email, code, name } = parsed.data

  const current = await getSession()
  const result = await verifyCode(email, code, name ?? (current?.kind === "guest" ? current.name : null))
  if (!result.ok) {
    return Response.json({ error: MESSAGES[result.reason], reason: result.reason }, { status: 400 })
  }

  if (current?.kind === "guest") await mergeGuestInto(current.userId, result.account.id)
  const session = await startAccountSession(result.account)
  return Response.json({ name: session.name, email: session.email, isNew: result.isNew })
}
