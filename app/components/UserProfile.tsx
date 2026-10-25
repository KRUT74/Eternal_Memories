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
        onClick={() => setShowDropdown(!showDropdown)}
        aria-expanded={showDropdown}
        aria-haspopup="menu"
        aria-label={`Account menu for ${name}`}
        className="flex items-center space-x-2"
      >
        <UserIcon className="h-4 w-4" />
        <span className="hidden md:inline">{name}</span>
      </Button>

      {showDropdown && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 bg-slate-900/80 backdrop-blur-md rounded-lg shadow-xl border border-white/20 z-50"
        >
          <div className="p-4 border-b border-white/20">
            <p className="font-medium text-white">{name}</p>
            <p className="text-xs text-white/60 mt-1">Your memories are private to this browser.</p>
          </div>
          <div className="p-2">
            <button
              role="menuitem"
              onClick={forgetEverything}
              className="flex items-center w-full px-3 py-2 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Forget everything and start over
            </button>
            {error && (
              <p className="px-3 pb-2 text-xs text-red-200" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
