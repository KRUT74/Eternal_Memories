import "server-only"
import { Resend } from "resend"
import { env } from "./env"

let client: Resend | null = null

function resend(): Resend {
  client ??= new Resend(env.resendApiKey)
  return client
}

/** Sends a sign-in code. Throws if Resend rejects the message. */
export async function sendCodeEmail(to: string, code: string, minutesValid: number) {
  const spaced = `${code.slice(0, 3)} ${code.slice(3)}`
  const { error } = await resend().emails.send({
    from: env.emailFrom,
    to,
    subject: `${spaced} is your Eternal Memories code`,
    text: `Your Eternal Memories sign-in code is ${spaced}.\n\nIt works for ${minutesValid} minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<!doctype html>
<html><body style="margin:0;background:#0b1020;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#e7e9f0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1020;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#131a2d;border:1px solid #243050;border-radius:20px;padding:32px">
        <tr><td style="font-family:Georgia,serif;font-size:24px;color:#e7e9f0">Eternal <i style="color:#f2c46d">Memories</i></td></tr>
        <tr><td style="padding-top:20px;font-size:15px;color:#9aa2b9">Here's your sign-in code:</td></tr>
        <tr><td style="padding:14px 0 6px;font-family:Menlo,Consolas,monospace;font-size:34px;letter-spacing:6px;color:#f2c46d">${spaced}</td></tr>
        <tr><td style="font-size:13px;color:#9aa2b9">It works for ${minutesValid} minutes. If you didn't ask for it, you can ignore this email.</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
  })
  if (error) throw new Error(`Resend: ${error.message}`)
}
