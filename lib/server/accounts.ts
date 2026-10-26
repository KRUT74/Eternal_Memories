import "server-only"
import { createHmac, randomInt, randomUUID } from "node:crypto"
import { z } from "zod"
import { sendCodeEmail } from "./email"
import { env } from "./env"
import { supabase } from "./supabase"

const CODE_MINUTES = 10
const MAX_ATTEMPTS = 5
const CODES_PER_EMAIL_PER_15_MIN = 3
const CODES_PER_NETWORK_PER_HOUR = 10

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email().max(254))

export interface Account {
  id: string
  email: string
  name: string
}

// Codes are stored only as an HMAC, so a database leak doesn't reveal live codes.
const hashCode = (email: string, code: string) =>
  createHmac("sha256", env.sessionSecret).update(`code:${email}:${code}`).digest("base64url")

async function countCodes(column: "email" | "ip_hash", value: string, sinceMinutes: number): Promise<number> {
  const since = new Date(Date.now() - sinceMinutes * 60_000).toISOString()
  const { count, error } = await supabase()
    .from("email_codes")
    .select("id", { count: "exact", head: true })
    .eq(column, value)
    .gte("created_at", since)
  if (error) throw error
  return count ?? 0
}

export type RequestCodeResult = { ok: true } | { ok: false; reason: "rate_limited" | "send_failed" }

/** Emails a fresh 6-digit code, replacing any earlier unused one. */
export async function requestCode(email: string, ipHash: string): Promise<RequestCodeResult> {
  const [forEmail, forNetwork] = await Promise.all([
    countCodes("email", email, 15),
    countCodes("ip_hash", ipHash, 60),
  ])
  if (forEmail >= CODES_PER_EMAIL_PER_15_MIN || forNetwork >= CODES_PER_NETWORK_PER_HOUR) {
    return { ok: false, reason: "rate_limited" }
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  const db = supabase()
  const { error: expireError } = await db
    .from("email_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("email", email)
    .is("consumed_at", null)
  if (expireError) throw expireError
  const { error } = await db.from("email_codes").insert({
    email,
    code_hash: hashCode(email, code),
    ip_hash: ipHash,
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  })
  if (error) throw error

  try {
    await sendCodeEmail(email, code, CODE_MINUTES)
    return { ok: true }
  } catch (err) {
    console.error("Sending sign-in code failed", err)
    return { ok: false, reason: "send_failed" }
  }
}

export type VerifyResult =
  | { ok: true; account: Account; isNew: boolean }
  | { ok: false; reason: "invalid" | "too_many" | "expired" | "none" }

/** Checks a code; on success returns the account, creating it on first sign-in. */
export async function verifyCode(email: string, code: string, nameForNewAccount: string | null): Promise<VerifyResult> {
  const { data: status, error } = await supabase().rpc("consume_email_code", {
    p_email: email,
    p_code_hash: hashCode(email, code),
    p_max_attempts: MAX_ATTEMPTS,
  })
  if (error) throw error
  if (status !== "ok") return { ok: false, reason: status as "invalid" | "too_many" | "expired" | "none" }

  const db = supabase()
  const { data: existing, error: findError } = await db
    .from("accounts")
    .select("id, email, name")
    .eq("email", email)
    .maybeSingle()
  if (findError) throw findError

  if (existing) {
    await db.from("accounts").update({ last_sign_in_at: new Date().toISOString() }).eq("id", existing.id)
    return { ok: true, account: existing, isNew: false }
  }

  const account = { id: `a_${randomUUID()}`, email, name: nameForNewAccount || email.split("@")[0] }
  const { error: insertError } = await db.from("accounts").insert({ ...account, last_sign_in_at: new Date().toISOString() })
  if (insertError) throw insertError
  return { ok: true, account, isNew: true }
}

/** Moves a guest's conversation and memories onto the account they just signed in to. */
export async function mergeGuestInto(guestId: string, accountId: string) {
  const { error } = await supabase().rpc("merge_user_data", { p_from: guestId, p_to: accountId })
  if (error) throw error
}

export async function accountExists(email: string): Promise<boolean> {
  const { count, error } = await supabase()
    .from("accounts")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
  if (error) throw error
  return (count ?? 0) > 0
}
