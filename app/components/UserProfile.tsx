"use client"

import { useState } from "react"
import { Button } from "./ui/button"
import { User as UserIcon, Trash2 } from "lucide-react"

interface UserProfileProps {
  name: string
  onForgotten: () => void
}

export default function UserProfile({ name, onForgotten }: UserProfileProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const forgetEverything = async () => {
    if (!window.confirm("Delete all your messages and memories and start over? This can't be undone.")) return
    const res = await fetch("/api/session", { method: "DELETE" })
    if (res.ok || res.status === 401) {
      onForgotten()
    } else {
      setError("Could not delete your data. Please try again.")
    }
  }

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-expanded={showDropdown}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex items-center gap-2 bg-transparent font-mono text-xs"
      >
        <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{name.toLowerCase()}</span>
      </Button>

      {showDropdown && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 rounded-xl border border-line bg-surface shadow-2xl shadow-black/40"
        >
          <div className="border-b border-line p-4">
            <p className="font-medium">{name}</p>
            <p className="mt-1 text-xs text-muted">Your memories are private to this browser.</p>
          </div>
          <div className="p-2">
            <button
              role="menuitem"
              onClick={forgetEverything}
              className="flex w-full items-center rounded-lg px-3 py-2 text-sm text-danger hover:bg-danger/10"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Forget everything and start over
            </button>
            {error && (
              <p className="px-3 pb-2 text-xs text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
