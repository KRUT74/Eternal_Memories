"use client"

import { useEffect, useState } from "react"
import { Brain, X } from "lucide-react"
import type { MemoryItem } from "../lib/types"

interface MemoryPanelProps {
  sessionId: string
  /** Changes whenever new memories were stored, so the panel refetches. */
  refreshKey: number
}

export default function MemoryPanel({ sessionId, refreshKey }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/memories?userId=${encodeURIComponent(sessionId)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load memories"))))
      .then((data: { memories: MemoryItem[] }) => {
        if (!cancelled) {
          setMemories(data.memories)
          setError(null)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, refreshKey])

  const forget = async (id: string) => {
    const previous = memories
    setMemories((current) => current?.filter((m) => m.id !== id) ?? null)
    const res = await fetch(`/api/memories/${id}?userId=${encodeURIComponent(sessionId)}`, { method: "DELETE" })
    if (!res.ok && res.status !== 404) {
      setMemories(previous)
      setError("Could not forget that memory")
    }
  }

  return (
    <section aria-labelledby="memory-panel-title" className="glass-card rounded-xl p-4 md:h-[70vh] flex flex-col">
      <h2 id="memory-panel-title" className="flex items-center gap-2 text-white font-semibold mb-1">
        <Brain className="h-4 w-4 text-purple-300" aria-hidden="true" />
        What I remember
      </h2>
      <p className="text-xs text-white/60 mb-3">Facts I&apos;ve picked up from our chats. Remove anything you&apos;d rather I forgot.</p>

      {error && (
        <p className="text-xs text-red-200 mb-2" role="alert">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto">
        {memories === null ? (
          !error && <p className="text-sm text-white/60">Loading...</p>
        ) : memories.length === 0 ? (
          <p className="text-sm text-white/60">Nothing yet. Tell me about yourself.</p>
        ) : (
          <ul className="space-y-2">
            {memories.map((memory) => (
              <li key={memory.id} className="group flex items-start gap-2 rounded-lg bg-white/10 p-2 text-sm text-white/90">
                <span className="flex-1">{memory.content}</span>
                <button
                  type="button"
                  onClick={() => forget(memory.id)}
                  aria-label={`Forget: ${memory.content}`}
                  className="shrink-0 rounded p-1 text-white/50 hover:text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-purple-300"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
