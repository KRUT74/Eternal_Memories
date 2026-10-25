import "server-only"
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"
import { cookies } from "next/headers"
import { env } from "./env"

// Each browser gets a random user ID in a signed, httpOnly cookie. The server
// never accepts a user ID from the request body or URL, so nobody can reach
// another visitor's memories by guessing or changing an ID.

const COOKIE_NAME = "em_session"
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365

export interface Session {
  userId: string
  name: string
}

function sign(payload: string): string {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("base64url")
}

function encode(session: Session): string {
  const payload = Buffer.from(JSON.stringify({ u: session.userId, n: session.name })).toString("base64url")
  return `${payload}.${sign(payload)}`
}

function decode(value: string): Session | null {
  const [payload, signature] = value.split(".")
  if (!payload || !signature) return null

  const expected = Buffer.from(sign(payload))
  const actual = Buffer.from(signature)
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  try {
    const { u, n } = JSON.parse(Buffer.from(payload, "base64url").toString())
    return typeof u === "string" && typeof n === "string" ? { userId: u, name: n } : null
  } catch {
    return null
  }
}

export async function getSession(): Promise<Session | null> {
  const value = (await cookies()).get(COOKIE_NAME)?.value
  return value ? decode(value) : null
}

export async function startSession(name: string): Promise<Session> {
  const session = { userId: `u_${randomUUID()}`, name }
  await writeCookie(session)
  return session
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
