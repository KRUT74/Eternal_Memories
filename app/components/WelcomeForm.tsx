"use client"

import type React from "react"
import { useState } from "react"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

export default function WelcomeForm({ onStarted }: { onStarted: () => void }) {
  const [name, setName] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Could not start your session")
      }
      onStarted()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start your session")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-3xl border border-line bg-surface/90 p-8 shadow-2xl shadow-black/30">
      <h2 className="font-serif text-4xl leading-tight text-balance">
        Every conversation <i className="text-star">leaves a star.</i>
      </h2>
      <p className="mt-3 text-muted">
        Talk or type with a companion that remembers the people, plans and things you care about, across every
        conversation.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
            What should I call you?
          </label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your first name"
            autoComplete="given-name"
            maxLength={40}
            className="h-11 bg-[#0e1426] placeholder:text-[#7a84a3]"
            required
          />
        </div>

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-2 text-sm text-[#fbd0d0]" role="alert">
            {error}
          </div>
        )}

        <Button type="submit" disabled={isLoading || !name.trim()} className="h-11 w-full text-base">
          {isLoading ? "Opening your sky…" : "Begin"}
        </Button>
      </form>

      <p className="mt-6 font-mono text-[11px] leading-relaxed text-muted">
        no account needed · memories stay private to this browser · forget anything, any time
      </p>
    </div>
  )
}
