import type { User } from "./types"

/**
 * Deterministic session ID derived from the user's email.
 * Do not change: existing users' stored history is keyed by this value.
 */
export function generateUserSessionId(userEmail: string): string {
  const normalizedEmail = userEmail.toLowerCase().trim()

  let hash = 0
  for (let i = 0; i < normalizedEmail.length; i++) {
    hash = (hash << 5) - hash + normalizedEmail.charCodeAt(i)
    hash = hash & hash // Convert to 32-bit integer
  }

  return `user_session_${Math.abs(hash).toString(16)}`
}

/** Returns the stored session ID for this user, creating and storing one if needed. */
export function getOrCreateSessionId(user: User): string {
  const userKey = `session_${user.email.toLowerCase().trim()}`
  const existing = localStorage.getItem(userKey)
  if (existing) return existing

  const sessionId = generateUserSessionId(user.email)
  localStorage.setItem(userKey, sessionId)
  return sessionId
}
