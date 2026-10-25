import { useSyncExternalStore } from "react"
import type { User } from "./types"

const USER_KEY = "chat_user"
const CHANGE_EVENT = "chat-user-change"

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("storage", onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function parseUser(raw: string | null): User | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as User
  } catch {
    return null
  }
}

let cachedRaw: string | null = null
let cachedUser: User | null = null

function getSnapshot(): User | null {
  const raw = localStorage.getItem(USER_KEY)
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedUser = parseUser(raw)
  }
  return cachedUser
}

/** The signed-in demo user, or `undefined` while rendering on the server. */
export function useStoredUser(): User | null | undefined {
  return useSyncExternalStore(subscribe, getSnapshot, () => undefined)
}

export function setStoredUser(user: User | null) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(USER_KEY)
  window.dispatchEvent(new Event(CHANGE_EVENT))
}
