"use client"

import { useEffect, useState } from "react"
import { Pin, Sparkles, X } from "lucide-react"
import Constellation from "./Constellation"
import type { MemoryItem, TidyChange, TidyRun } from "../lib/types"

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (minutes < 2) return "just now"
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function describeChange(change: TidyChange): string {
  switch (change.op) {
    case "merge":
      return `Combined ${change.sources.length} memories into “${change.created.content}”`
    case "update":
      return `Reworded “${change.before}” as “${change.after}”`
    case "retire":
      return `Set aside “${change.content}”`
    case "core":
      return change.core ? `Now always in mind: “${change.content}”` : `No longer always in mind: “${change.content}”`
  }
}

function tidySummary(run: TidyRun): string {
  const parts = [
    run.merged && `combined ${run.merged}`,
    run.updated && `reworded ${run.updated}`,
    run.retired && `set aside ${run.retired}`,
    run.core_changed && `${run.core_changed} always-in-mind change${run.core_changed === 1 ? "" : "s"}`,
  ].filter(Boolean)
  return parts.length ? parts.join(", ") : "nothing needed changing"
}

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
  const [tidy, setTidy] = useState<TidyRun | null>(null)
  const [tidying, setTidying] = useState(false)
  // Bumped after an undo or a manual tidy-up, to reload the list.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch("/api/memories")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Could not load memories"))))
      .then((data: { memories: MemoryItem[]; lastTidy?: TidyRun | null }) => {
        if (!cancelled) {
          setMemories(data.memories)
          setTidy(data.lastTidy ?? null)
          setError(null)
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey, reloadKey])

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

  const togglePin = async (memory: MemoryItem) => {
    const pinned = !memory.pinned
    setMemories((current) => current?.map((m) => (m.id === memory.id ? { ...m, pinned } : m)) ?? null)
    const res = await fetch(`/api/memories/${memory.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    })
    if (!res.ok) {
      setMemories((current) => current?.map((m) => (m.id === memory.id ? { ...m, pinned: !pinned } : m)) ?? null)
      setError("Could not update that memory")
    }
  }

  const tidyNow = async () => {
    setTidying(true)
    setError(null)
    const res = await fetch("/api/memories/tidy", { method: "POST" })
    setTidying(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return setError(data.error || "Couldn't tidy your memories just now")
    }
    setReloadKey((k) => k + 1)
  }

  const undo = async (index: number) => {
    if (!tidy) return
    const res = await fetch("/api/memories/tidy/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runId: tidy.id, index }),
    })
    if (!res.ok) return setError("Couldn't undo that change")
    setReloadKey((k) => k + 1)
  }

  const alwaysInMind = memories?.filter((m) => m.is_core || m.pinned) ?? []
  const others = memories?.filter((m) => !m.is_core && !m.pinned) ?? []

  const renderMemory = (memory: MemoryItem) => {
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
          onClick={() => togglePin(memory)}
          aria-pressed={Boolean(memory.pinned)}
          aria-label={`Always remember: ${memory.content}`}
          title={memory.pinned ? "Pinned: always remembered" : "Always remember this"}
          className={`shrink-0 rounded p-1 hover:bg-surface-raised ${memory.pinned ? "text-star" : "text-[#7a84a3] hover:text-text"}`}
        >
          <Pin className="h-3.5 w-3.5" aria-hidden="true" fill={memory.pinned ? "currentColor" : "none"} />
        </button>
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
        Each star is something I remember. Gold ones shaped my last reply, teal ones are new, and ringed ones are always in mind.
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
          <div className="mt-4 flex-1 space-y-4 overflow-y-auto pr-1">
            {alwaysInMind.length > 0 && (
              <div role="group" aria-labelledby="always-in-mind-title">
                <h3 id="always-in-mind-title" className="mb-2 font-mono text-[11px] uppercase tracking-wider text-star">
                  Always in mind
                </h3>
                <ul className="space-y-2">{alwaysInMind.map(renderMemory)}</ul>
              </div>
            )}
            {others.length > 0 && (
              <div>
                {alwaysInMind.length > 0 && (
                  <h3 className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">Other memories</h3>
                )}
                <ul className="space-y-2">{others.map(renderMemory)}</ul>
              </div>
            )}
            <div className="rounded-xl border border-line p-3 text-[13px] text-muted">
              <div className="flex items-center justify-between gap-2">
                <span>{tidy ? `Tidied ${timeAgo(tidy.created_at)}: ${tidySummary(tidy)}.` : "Not tidied yet."}</span>
                <button
                  type="button"
                  onClick={tidyNow}
                  disabled={tidying}
                  className="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-star hover:bg-surface-raised disabled:text-muted"
                >
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  {tidying ? "Tidying…" : "Tidy up now"}
                </button>
              </div>
              {tidy && tidy.changes.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-text">What changed</summary>
                  <ul className="mt-2 space-y-2">
                    {tidy.changes.map((change, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <span className={`flex-1 ${change.undone ? "line-through opacity-60" : ""}`}>
                          {describeChange(change)}
                          <span className="block text-[11px]">{change.reason}</span>
                        </span>
                        {change.undone ? (
                          <span className="shrink-0 text-[11px]">undone</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => undo(index)}
                            className="shrink-0 rounded px-1.5 py-0.5 text-star hover:bg-surface-raised"
                            aria-label={`Undo: ${describeChange(change)}`}
                          >
                            Undo
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
