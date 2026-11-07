"use client"

import type { MemoryItem } from "../lib/types"

interface ConstellationProps {
  memories: MemoryItem[]
  shapingIds: Set<string>
  newIds: Set<string>
  activeId: string | null
  onActivate: (id: string | null) => void
}

const WIDTH = 300
const HEIGHT = 170
const PAD = 18

// FNV-1a plus a murmur3 finalizer: stable, well-spread pseudo-random numbers per
// memory, so a star never moves and similar ids don't clump together.
function hash(text: string, seed: number): number {
  let h = 2166136261 ^ Math.imul(seed, 0x9e3779b1)
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return (h >>> 0) / 4294967295
}

function position(id: string) {
  return {
    x: PAD + hash(id, 1) * (WIDTH - PAD * 2),
    y: PAD + hash(id, 2) * (HEIGHT - PAD * 2),
  }
}

// Faint background stars for atmosphere.
const DUST = Array.from({ length: 28 }, (_, i) => ({
  x: hash(`dust${i}`, 3) * WIDTH,
  y: hash(`dust${i}`, 4) * HEIGHT,
  r: 0.6 + hash(`dust${i}`, 5) * 0.8,
}))

type Star = MemoryItem & { x: number; y: number }

/**
 * Lines join related memories: those about the same person or thing, or failing
 * that the same kind of memory. Each star links to the previous one in its group.
 */
function relatedLinks(stars: Star[]): [Star, Star][] {
  const lastInGroup = new Map<string, Star>()
  const links: [Star, Star][] = []
  for (const star of stars) {
    const subject = star.subject?.trim().toLowerCase()
    const group = subject ? `subject:${subject}` : star.category && star.category !== "other" ? `category:${star.category}` : null
    if (!group) continue
    const previous = lastInGroup.get(group)
    if (previous) links.push([previous, star])
    lastInGroup.set(group, star)
  }
  return links
}

export default function Constellation({ memories, shapingIds, newIds, activeId, onActivate }: ConstellationProps) {
  // Oldest first, so each group's lines trace the order things were learned.
  const stars: Star[] = [...memories]
    .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""))
    .map((m) => ({ ...m, ...position(m.id) }))

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="block w-full rounded-xl bg-[#0e1426]"
      role="group"
      aria-label={`Star map of ${memories.length} memories. Each star is a memory.`}
    >
      <g aria-hidden="true">
        {DUST.map((d, i) => (
          <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#3b4566" />
        ))}
        {relatedLinks(stars).map(([a, b]) => {
          const lit = activeId === a.id || activeId === b.id
          return (
            <line
              key={`${a.id}-${b.id}`}
              data-testid="memory-link"
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={lit ? "var(--star)" : "#2e3b63"}
              strokeWidth={lit ? 1.4 : 1}
            />
          )
        })}
      </g>

      {stars.map((s) => {
        const shaping = shapingIds.has(s.id)
        const fresh = newIds.has(s.id)
        const active = activeId === s.id
        const color = fresh ? "var(--teal)" : shaping ? "var(--star)" : "#8a93b0"
        const always = s.is_core || s.pinned
        return (
          // Focusable so keyboard users can walk the map; focusing a star highlights its list entry.
          <g
            key={s.id}
            role="img"
            tabIndex={0}
            aria-label={`Memory: ${s.content}${always ? " (always in mind)" : ""}${shaping ? " (shaped the last reply)" : ""}${fresh ? " (new)" : ""}`}
            onMouseEnter={() => onActivate(s.id)}
            onMouseLeave={() => onActivate(null)}
            onFocus={() => onActivate(s.id)}
            onBlur={() => onActivate(null)}
            className={`outline-none ${fresh ? "star-in" : ""}`}
          >
            {/* larger invisible hit area */}
            <circle cx={s.x} cy={s.y} r={12} fill="transparent" />
            {(shaping || fresh || active) && <circle cx={s.x} cy={s.y} r={active ? 12 : 9} fill={color} opacity={0.2} />}
            <circle cx={s.x} cy={s.y} r={shaping || fresh || active ? 3.8 : 2.6} fill={color} />
            {/* A ring marks memories that are always in mind. */}
            {always && !active && <circle cx={s.x} cy={s.y} r={5.5} fill="none" stroke="var(--star)" strokeWidth="0.9" opacity={0.75} />}
            {active && <circle cx={s.x} cy={s.y} r={7} fill="none" stroke="var(--text)" strokeWidth="1" />}
          </g>
        )
      })}
    </svg>
  )
}
