export interface MemoryItem {
  id: string
  content: string
  created_at?: string
  category?: string
  subject?: string | null
  /** Always included in replies (key people, health, routines, home). */
  is_core?: boolean
  /** "Always remember this", set by the person. */
  pinned?: boolean
}

export type TidyChange =
  | { op: "merge"; sources: { id: string; content: string }[]; created: { id: string; content: string }; reason: string; undone?: boolean }
  | { op: "update"; id: string; before: string; after: string; reason: string; undone?: boolean }
  | { op: "retire"; id: string; content: string; reason: string; undone?: boolean }
  | { op: "core"; id: string; content: string; core: boolean; reason: string; undone?: boolean }

export interface TidyRun {
  id: string
  created_at: string
  merged: number
  updated: number
  retired: number
  core_changed: number
  changes: TidyChange[]
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

/** How many recalled memories count as having "shaped" a reply in the UI. */
export const SHAPING_MEMORIES = 3
