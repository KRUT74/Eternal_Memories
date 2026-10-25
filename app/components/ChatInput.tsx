"use client"

import type React from "react"
import { ArrowUp, Mic } from "lucide-react"

interface ChatInputProps {
  input: string
  onInputChange: (value: string) => void
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  disabled: boolean
  onStartVoice?: () => void
}

export default function ChatInput({ input, onInputChange, onSubmit, disabled, onStartVoice }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-end gap-2 rounded-2xl border border-line bg-[#0e1426] p-2 pl-4 focus-within:border-star/60"
    >
      <textarea
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Say something to remember…"
        aria-label="Message"
        rows={1}
        maxLength={2000}
        disabled={disabled}
        className="min-h-10 max-h-40 flex-1 resize-none bg-transparent py-2 text-text placeholder:text-[#7a84a3] outline-none field-sizing-content disabled:opacity-60"
      />
      {onStartVoice && (
        <button
          type="button"
          onClick={onStartVoice}
          disabled={disabled}
          aria-label="Start voice conversation"
          title="Talk instead of typing"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-line text-star hover:bg-star-soft disabled:opacity-40"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      <button
        type="submit"
        disabled={disabled || !input.trim()}
        aria-label="Send message"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-star text-[#1a1405] hover:brightness-110 disabled:opacity-40"
      >
        <ArrowUp className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  )
}
