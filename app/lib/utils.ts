import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * Combines class names using clsx and tailwind-merge
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes error messages to prevent leaking sensitive information
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Remove any potential sensitive information from error messages
    return error.message.replace(/key-[a-zA-Z0-9_-]{20,}/g, "[API_KEY]")
  }
  return "An unknown error occurred"
}

/**
 * Formats a timestamp into a human-readable string
 */
export function formatTimestamp(timestamp: string | Date): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}

/**
 * Truncates a string to a specified length
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength) + "..."
}

/**
 * CRITICAL: Generates a consistent session ID based on user email
 * This function MUST NEVER CHANGE to ensure session IDs remain consistent
 * Any changes to this function will break existing user sessions
 */
export function generateUserSessionId(userEmail: string): string {
  // Normalize the email - this is the EXACT same normalization as before
  const normalizedEmail = userEmail.toLowerCase().trim()

  // Use the EXACT same hash function as the original implementation
  // This ensures backwards compatibility with existing session IDs
  let hash = 0
  for (let i = 0; i < normalizedEmail.length; i++) {
    const char = normalizedEmail.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32-bit integer
  }

  // Convert to positive number and create session ID - EXACT same format
  const positiveHash = Math.abs(hash).toString(16)
  return `user_session_${positiveHash}`
}

/**
 * CRITICAL: Session ID validation and recovery system
 * Ensures session IDs are never lost or changed for existing users
 */
export function getOrCreateSessionId(user: { id: string; name: string; email: string }): string {
  if (typeof window === "undefined") {
    // Server-side fallback
    return generateUserSessionId(user.email)
  }

  const userKey = `session_${user.email.toLowerCase().trim()}`

  // First, check if we have a stored session ID for this specific user
  const existingSessionId = localStorage.getItem(userKey)

  if (existingSessionId) {
    console.log(`🔒 Retrieved existing session ID for ${user.email}:`, existingSessionId)
    return existingSessionId
  }

  // Check the old storage key for backwards compatibility
  const oldSessionId = localStorage.getItem("chatSessionId")
  const currentUser = localStorage.getItem("chat_user")

  if (oldSessionId && currentUser) {
    try {
      const parsedUser = JSON.parse(currentUser)
      if (parsedUser.email === user.email) {
        // This session ID belongs to the current user, preserve it
        localStorage.setItem(userKey, oldSessionId)
        console.log(`🔄 Migrated existing session ID for ${user.email}:`, oldSessionId)
        return oldSessionId
      }
    } catch (error) {
      console.warn("Failed to parse stored user for session migration:", error)
    }
  }

  // Generate new session ID using the deterministic function
  const newSessionId = generateUserSessionId(user.email)

  // Store it with the user-specific key
  localStorage.setItem(userKey, newSessionId)

  // Also update the general session ID for backwards compatibility
  localStorage.setItem("chatSessionId", newSessionId)

  console.log(`✨ Generated new session ID for ${user.email}:`, newSessionId)
  return newSessionId
}

/**
 * Validates that a session ID matches what it should be for a user
 * This helps detect and prevent session ID corruption
 */
export function validateSessionId(user: { email: string }, sessionId: string): boolean {
  const expectedSessionId = generateUserSessionId(user.email)
  const isValid = sessionId === expectedSessionId

  if (!isValid) {
    console.error(`🚨 SESSION ID MISMATCH for ${user.email}:`)
    console.error(`Expected: ${expectedSessionId}`)
    console.error(`Got: ${sessionId}`)
  }

  return isValid
}

/**
 * Emergency session recovery - attempts to restore the correct session ID
 */
export function recoverSessionId(user: { id: string; name: string; email: string }): string {
  console.log(`🔧 Attempting session recovery for ${user.email}`)

  // Clear any corrupted session data
  localStorage.removeItem("chatSessionId")

  // Use the deterministic generation and storage system
  return getOrCreateSessionId(user)
}
