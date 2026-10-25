export interface MemoryItem {
  id: string
  content: string
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  /** Facts stored after this reply (shown under the message, not persisted). */
  remembered?: MemoryItem[]
}

export interface SessionInfo {
  name: string
  remainingToday: number
}
