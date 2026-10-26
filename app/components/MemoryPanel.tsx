"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import Constellation from "./Constellation"
import type { MemoryItem } from "../lib/types"

interface MemoryPanelProps {
  /** Changes whenever new memories were stored, so the panel refetches. */
  refreshKey: number
  shapingIds: Set<string>
  newIds: Set<string>
  onCountChange: (count: number) => void
  onClose?: () => void
}

export default function MemoryPanel({ refreshKey, shapingIds, newIds, onCountChange, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/memories")
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
  }, [refreshKey])

  useEffect(() => {
    if (memories) onCountChange(memories.length)
  }, [memories, onCountChange])

  const forget = async (id: string) => {
    const previous = memories
    setMemories((current) => current?.filter((m) => m.id !== id) ?? null)
    const res = await fetch(`/api/memories/${id}`, { method: "DELETE" })
    if (!res.ok && res.status !== 404) {
      setMemories(previous)
      setError("Could not forget that memory")
    }
  }

  return (
    <section aria-labelledby="memory-panel-title" className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-2">
        <h2 id="memory-panel-title" className="font-serif text-2xl leading-tight">
          Your constellation
        </h2>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close constellation"
            className="rounded-lg p-1.5 text-muted hover:text-text md:hidden"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>
      <p className="mb-4 mt-1 text-[13px] text-muted">
        Each star is something I remember. Gold ones shaped my last reply; teal ones are new.
      </p>

      {error && (
        <p className="mb-2 text-xs text-danger" role="alert">
          {error}
        </p>
      )}

      {memories === null ? (
        !error && (
          <p className="text-sm text-muted" role="status">
            Charting your stars…
          </p>
        )
      ) : memories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          No stars yet. Tell me about the people, plans and things you care about, and they&apos;ll appear here.
        </div>
      ) : (
        <>
          <Constellation
            memories={memories}
            shapingIds={shapingIds}
            newIds={newIds}
            activeId={activeId}
            onActivate={setActiveId}
          />
          <ul className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
            {memories.map((memory) => {
              const shaping = shapingIds.has(memory.id)
              const fresh = newIds.has(memory.id)
              const active = activeId === memory.id
              return (
                <li
                  key={memory.id}
                  data-active={active || undefined}
                  onMouseEnter={() => setActiveId(memory.id)}
                  onMouseLeave={() => setActiveId(null)}
                  className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    active ? "border-text/50 bg-surface-raised" : shaping ? "border-star/35" : fresh ? "border-teal/40" : "border-line"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                      fresh ? "bg-teal shadow-[0_0_10px_var(--teal)]" : shaping ? "bg-star shadow-[0_0_10px_var(--star)]" : "bg-[#56607e]"
                    }`}
                  />
                  <span className="flex-1">
                    {memory.content}
                    {(shaping || fresh) && <span className="sr-only">{fresh ? " (new)" : " (shaped the last reply)"}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => forget(memory.id)}
                    aria-label={`Forget: ${memory.content}`}
                    className="shrink-0 rounded p-1 text-[#7a84a3] hover:bg-surface-raised hover:text-text"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}
