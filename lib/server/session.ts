import "server-only"
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { env } from "./env"

// Identity lives in a signed, httpOnly cookie. Guests get a random ID tied to
// one browser; email accounts get their account's stable ID after proving they
// own the address. The server never accepts a user ID from the request body or
// URL, so nobody can reach another visitor's memories by guessing an ID.

const COOKIE_NAME = "em_session"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export interface Session {
  userId: string
  name: string
  kind: "guest" | "email"
  /** Masked for display, e.g. "be•••@hotmail.com". Email accounts only. */
  email?: string
}

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url")
}

function encode(session: Session): string {
  const payload = Buffer.from(
    JSON.stringify({ u: session.userId, n: session.name, k: session.kind, e: session.email }),
  ).toString("base64url")
  return `${payload}.${sign(payload)}`
}

function decode(value: string): Session | null {
  const [payload, signature] = value.split(".")
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const { u, n, k, e } = JSON.parse(Buffer.from(payload, "base64url").toString())
    if (typeof u !== "string" || typeof n !== "string") return null
    // Cookies from before email sign-in have no kind: they are guests.
    return k === "email" ? { userId: u, name: n, kind: "email", email: typeof e === "string" ? e : undefined } : { userId: u, name: n, kind: "guest" }
  } catch {
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value
  return value ? decode(value) : null
}

/** A new guest: random ID, this browser only. */
export async function startSession(name: string): Promise<Session> {
  const session: Session = { userId: `u_${randomUUID()}`, name, kind: "guest" }
  await writeCookie(session)
  return session
}

/** Signs in to a verified email account. */
export async function startAccountSession(account: { id: string; name: string; email: string }): Promise<Session> {
  const session: Session = { userId: account.id, name: account.name, kind: "email", email: maskEmail(account.email) }
  await writeCookie(session)
  return session
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@")
  return `${local.slice(0, 2)}•••@${domain}`
}

export async function renameSession(session: Session, name: string): Promise<Session> {
  const renamed = { ...session, name }
  await writeCookie(renamed)
  return renamed
}

export async function endSession() {
  ;(await cookies()).delete(COOKIE_NAME)
}

async function writeCookie(session: Session) {
  ;(await cookies()).set(COOKIE_NAME, encode(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  })
}

/** Keyed hash of the caller's IP, so limits work without storing raw IPs. */
export function ipHash(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = forwarded || req.headers.get("x-real-ip") || "unknown"
  return createHmac("sha256", env.sessionSecret).update(`ip:${ip}`).digest("base64url").slice(0, 32)
}

export function unauthorized() {
  return Response.json({ error: "Your session has expired. Please start a new one." }, { status: 401 })
}
