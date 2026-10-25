"use client"

import type React from "react"
import { useState } from "react"
import { Sparkles } from "lucide-react"
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
    <div className="glass-card p-8 rounded-xl max-w-md mx-auto">
      <div className="flex items-center justify-center mb-4">
        <Sparkles className="h-8 w-8 mr-2 text-purple-400" aria-hidden="true" />
        <h2 className="text-2xl font-bold text-white">Enter the Cosmos</h2>
      </div>
      <p className="text-sm text-white/70 text-center mb-6">
        A companion that remembers what matters to you, across every conversation.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-white/80 mb-1">
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
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
            required
          />
        </div>

        {error && (
          <div className="text-red-200 text-sm bg-red-500/20 p-2 rounded border border-red-500/30" role="alert">
            {error}
          </div>
        )}

        <Button type="submit" disabled={isLoading || !name.trim()} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
          {isLoading ? "Opening the cosmos..." : "Start talking"}
        </Button>
      </form>

      <p className="mt-6 text-xs text-white/60 text-center">
        No account needed. Your memories stay private to this browser, and you can make me forget them at any time.
      </p>
    </div>
  )
}
