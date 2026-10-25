"use client"

import type { VoiceStatus } from "../lib/voice/useVoiceConversation"

const LABELS: Record<Exclude<VoiceStatus, "idle">, string> = {
  connecting: "Opening the line…",
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking… talk to interrupt",
}

interface VoiceBarProps {
  status: Exclude<VoiceStatus, "idle">
  partial: string
  /** Shown instead of the transcript, e.g. when no sound is reaching the microphone. */
  hint?: string | null
  onEnd: () => void
}

/** Replaces the text box during a voice conversation. */
export default function VoiceBar({ status, partial, hint, onEnd }: VoiceBarProps) {
  const color = status === "listening" ? "var(--teal)" : "var(--star)"
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-star/40 bg-[#0e1426] p-3 pl-4" role="group" aria-label="Voice conversation">
      <svg viewBox="0 0 48 48" className={`h-12 w-12 shrink-0 orb-${status === "connecting" ? "thinking" : status}`} aria-hidden="true">
        <circle cx="24" cy="24" r="20" fill={color} opacity="0.12" />
        <circle cx="24" cy="24" r="12" fill={color} opacity="0.22" />
        <path d="M24 10 L27 21 L38 24 L27 27 L24 38 L21 27 L10 24 L21 21 Z" fill={color} />
      </svg>

      <div className="min-w-0 flex-1" aria-live="polite">
        <p className="font-mono text-xs tracking-wide" style={{ color }}>
          {LABELS[status]}
        </p>
        {hint && !partial ? (
          <p className="text-sm text-[#f7dca4]">{hint}</p>
        ) : (
          <p className="truncate text-sm text-text/90">
            {partial || (status === "listening" ? "Go ahead, I'm listening." : "\u00a0")}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onEnd}
        className="shrink-0 rounded-xl border border-line px-3 py-2 text-sm hover:bg-surface-raised"
      >
        End <span className="hidden font-mono text-[11px] text-muted sm:inline">esc</span>
      </button>
    </div>
  )
}
