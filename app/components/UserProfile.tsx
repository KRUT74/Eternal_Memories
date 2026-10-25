"use client"

import { useState } from "react"
import { Button } from "./ui/button"
import { User as UserIcon, LogOut } from "lucide-react"
import type { User } from "../lib/types"

interface UserProfileProps {
  user: User
  onLogout: () => void
}

export default function UserProfile({ user, onLogout }: UserProfileProps) {
  const [showDropdown, setShowDropdown] = useState(false)

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setShowDropdown(!showDropdown)}
        aria-expanded={showDropdown}
        aria-haspopup="menu"
        aria-label={`Account menu for ${user.name}`}
        className="flex items-center space-x-2"
      >
        <UserIcon className="h-4 w-4" />
        <span className="hidden md:inline">{user.name}</span>
      </Button>

      {showDropdown && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 bg-slate-900/80 backdrop-blur-md rounded-lg shadow-xl border border-white/20 z-50"
        >
          <div className="p-4 border-b border-white/20">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                <UserIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-white">{user.name}</p>
                <p className="text-sm text-white/70">{user.email}</p>
              </div>
            </div>
          </div>
          <div className="p-2">
            <button
              role="menuitem"
              onClick={onLogout}
              className="flex items-center w-full px-3 py-2 text-sm text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
