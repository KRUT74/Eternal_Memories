import "server-only"
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server"
import { SITE_NAME, SITE_URL } from "@/lib/site"
import type { Account } from "./accounts"
import { supabase } from "./supabase"

// Face sign-in with passkeys. The device checks the face (or fingerprint, or PIN)
// itself and signs a one-time challenge; we keep only the passkey's public key.
// Every challenge lives in the database and is consumed atomically, so a captured
// response can't be replayed.

const CHALLENGE_MINUTES = 5
const LOGIN_CHALLENGES_PER_NETWORK_PER_HOUR = 30
const REGISTER_CHALLENGES_PER_USER_PER_HOUR = 10

export interface Passkey {
  id: string
  device_label: string
  created_at: string
  last_used_at: string | null
}

/**
 * The origins passkeys may be used from: the main site, this deployment's own
 * Vercel URLs (previews), and localhost outside production. The request's Origin
 * header must be one of them; the passkey is then bound to that host.
 */
function allowedOrigins(): string[] {
  const origins = [SITE_URL]
  for (const host of [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]) {
    if (host) origins.push(`https://${host}`)
  }
  return origins
}

export function relyingParty(req: Request): { origin: string; rpID: string } | null {
  const origin = req.headers.get("origin")
  if (!origin) return null
  const url = new URL(origin)
  const local = process.env.VERCEL_ENV !== "production" && url.hostname === "localhost"
  if (!local && !allowedOrigins().includes(origin)) return null
  return { origin, rpID: url.hostname }
}

/** A short name for the device, shown in the account menu: "iPhone", "Mac", … */
export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? ""
  if (/iPhone/.test(ua)) return "iPhone"
  if (/iPad/.test(ua)) return "iPad"
  if (/Android/.test(ua)) return "Android"
  if (/Mac OS X|Macintosh/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows"
  return "this device"
}

async function saveChallenge(challenge: string, purpose: "register" | "login", ipHash: string, userId: string | null) {
  const db = supabase()
  // Tidy up: challenges are only needed for an hour of rate-limit counting.
  await db.from("passkey_challenges").delete().lt("created_at", new Date(Date.now() - 2 * 3600_000).toISOString())
  const { error } = await db.from("passkey_challenges").insert({
    challenge,
    purpose,
    user_id: userId,
    ip_hash: ipHash,
    expires_at: new Date(Date.now() + CHALLENGE_MINUTES * 60_000).toISOString(),
  })
  if (error) throw error
}

/** Marks a challenge used. True only for the first caller, and only while it's fresh. */
async function consumeChallenge(challenge: string, purpose: "register" | "login", userId: string | null): Promise<boolean> {
  let query = supabase()
    .from("passkey_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("challenge", challenge)
    .eq("purpose", purpose)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
  if (userId) query = query.eq("user_id", userId)
  const { data, error } = await query.select("challenge")
  if (error) throw error
  return (data?.length ?? 0) === 1
}

async function countChallenges(column: "ip_hash" | "user_id", value: string, purpose: "register" | "login"): Promise<number> {
  const { count, error } = await supabase()
    .from("passkey_challenges")
    .select("challenge", { count: "exact", head: true })
    .eq(column, value)
    .eq("purpose", purpose)
    .gte("created_at", new Date(Date.now() - 3600_000).toISOString())
  if (error) throw error
  return count ?? 0
}

export async function listPasskeys(userId: string): Promise<Passkey[]> {
  const { data, error } = await supabase()
    .from("passkeys")
    .select("id, device_label, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function removePasskey(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase().from("passkeys").delete().eq("user_id", userId).eq("id", id).select("id")
  if (error) throw error
  return (data?.length ?? 0) === 1
}

async function findAccount(id: string): Promise<Account | null> {
  const { data, error } = await supabase().from("accounts").select("id, email, name").eq("id", id).maybeSingle()
  if (error) throw error
  return data
}

/** Step 1 of setting up face sign-in, for a signed-in email account. */
export async function registrationOptions(userId: string, rpID: string, ipHash: string) {
  if ((await countChallenges("user_id", userId, "register")) >= REGISTER_CHALLENGES_PER_USER_PER_HOUR) return null
  const account = await findAccount(userId)
  if (!account) return null
  const existing = await supabase().from("passkeys").select("id, transports").eq("user_id", userId)
  if (existing.error) throw existing.error

  const options = await generateRegistrationOptions({
    rpName: SITE_NAME,
    rpID,
    userName: account.email,
    userDisplayName: account.name,
    userID: new TextEncoder().encode(account.id),
    attestationType: "none",
    // Don't make a second passkey on a device that already has one.
    excludeCredentials: existing.data.map((p) => ({ id: p.id, transports: p.transports })),
    // A discoverable passkey, unlocked by face, fingerprint or PIN: no email needed later.
    authenticatorSelection: { residentKey: "required", userVerification: "required" },
  })
  await saveChallenge(options.challenge, "register", ipHash, userId)
  return options
}

/** Step 2: checks the new passkey and stores its public key. */
export async function registerPasskey(
  userId: string,
  response: RegistrationResponseJSON,
  rp: { origin: string; rpID: string },
  label: string,
): Promise<Passkey | null> {
  let verification
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: (challenge) => consumeChallenge(challenge, "register", userId),
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      requireUserVerification: true,
    })
  } catch (err) {
    console.warn("Passkey setup rejected", err instanceof Error ? err.message : err)
    return null
  }
  if (!verification.verified) return null

  const { credential } = verification.registrationInfo
  const passkey = {
    id: credential.id,
    user_id: userId,
    public_key: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? [],
    device_label: label,
  }
  const { data, error } = await supabase()
    .from("passkeys")
    .insert(passkey)
    .select("id, device_label, created_at, last_used_at")
    .single()
  if (error) throw error
  return data
}

/** Step 1 of signing in by face. No email needed: the device offers its passkey. */
export async function loginOptions(rpID: string, ipHash: string) {
  if ((await countChallenges("ip_hash", ipHash, "login")) >= LOGIN_CHALLENGES_PER_NETWORK_PER_HOUR) return null
  const options = await generateAuthenticationOptions({ rpID, userVerification: "required" })
  await saveChallenge(options.challenge, "login", ipHash, null)
  return options
}

export type LoginResult = { ok: true; account: Account } | { ok: false; reason: "unknown" | "failed" }

/** Step 2: checks the device's signature and returns the passkey's account. */
export async function verifyLogin(response: AuthenticationResponseJSON, rp: { origin: string; rpID: string }): Promise<LoginResult> {
  const db = supabase()
  const { data: passkey, error } = await db
    .from("passkeys")
    .select("id, user_id, public_key, counter, transports")
    .eq("id", response.id)
    .maybeSingle()
  if (error) throw error
  if (!passkey) return { ok: false, reason: "unknown" }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: (challenge) => consumeChallenge(challenge, "login", null),
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: {
        id: passkey.id,
        publicKey: Uint8Array.from(Buffer.from(passkey.public_key, "base64url")),
        counter: Number(passkey.counter),
        transports: passkey.transports,
      },
      requireUserVerification: true,
    })
  } catch (err) {
    console.warn("Passkey sign-in rejected", err instanceof Error ? err.message : err)
    return { ok: false, reason: "failed" }
  }
  if (!verification.verified) return { ok: false, reason: "failed" }

  const now = new Date().toISOString()
  await db.from("passkeys").update({ counter: verification.authenticationInfo.newCounter, last_used_at: now }).eq("id", passkey.id)
  const account = await findAccount(passkey.user_id)
  if (!account) return { ok: false, reason: "unknown" }
  await db.from("accounts").update({ last_sign_in_at: now }).eq("id", account.id)
  return { ok: true, account }
}
