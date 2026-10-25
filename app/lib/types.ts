export interface MemoryItem {
  id: string
  content: string
  created_at?: string
}

export interface RecalledMemory {
  id: string
  content: string
  similarity: number
}

export interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  /** Memories retrieved for this reply, closest first (live replies only, not persisted). */
  recalled?: RecalledMemory[]
  /** Facts stored after this reply (live replies only, not persisted). */
  remembered?: MemoryItem[]
}

export interface SessionInfo {
  name: string
  remainingToday: number
}

/** How many recalled memories count as having "shaped" a reply in the UI. */
export const SHAPING_MEMORIES = 3
