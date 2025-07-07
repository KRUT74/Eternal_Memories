"use client"

import { useState, useEffect } from "react"
import { Button } from "../components/ui/button"
import { User, LogOut, Settings, Database, Sparkles } from "lucide-react"

interface UserProfileProps {
  user: { id: string; name: string; email: string }
  sessionId: string
  onLogout: () => void
}

export default function UserProfile({ user, sessionId, onLogout }: UserProfileProps) {
  const [showDropdown, setShowDropdown] = useState(false)
  const [memoryCount, setMemoryCount] = useState<number>(0)
  const [memoryStatus, setMemoryStatus] = useState<"loading" | "connected" | "error">("loading")

  // Check memory status
  const checkMemoryStatus = async () => {
    try {
      const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
      const response = await fetch(`${baseUrl}/api/memory/status`)
      const data = await response.json()

      if (data.status === "ok") {
        setMemoryStatus("connected")
        setMemoryCount(data.messagesStored || 0)
      } else {
        setMemoryStatus("error")
        setMemoryCount(0)
      }
    } catch (error) {
      setMemoryStatus("error")
      setMemoryCount(0)
    }
  }

  useEffect(() => {
    checkMemoryStatus()
    // Update memory count every 30 seconds
    const interval = setInterval(checkMemoryStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem("chat_user")
    localStorage.removeItem("chatSessionId")
    onLogout()
  }

  const getMemoryStatusColor = () => {
    switch (memoryStatus) {
      case "connected":
        return "text-green-400"
      case "error":
        return "text-red-400"
      default:
        return "text-purple-400"
    }
  }

  const getMemoryStatusIcon = () => {
    switch (memoryStatus) {
      case "connected":
        return "✨"
      case "error":
        return "⚠️"
      default:
        return "🔄"
    }
  }

  return (
    <div className="relative">
      <Button variant="outline" onClick={() => setShowDropdown(!showDropdown)} className="flex items-center space-x-2">
        <User className="h-4 w-4" />
        <span className="hidden md:inline">{user.name}</span>
      </Button>

      {showDropdown && (
        <div className="absolute right-0 mt-2 w-80 bg-white/10 backdrop-blur-md rounded-lg shadow-xl border border-white/20 z-50">
          {/* User Info Header */}
          <div className="p-4 border-b border-white/20">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-500 rounded-full flex items-center justify-center">
                <User className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-medium text-white">{user.name}</p>
                <p className="text-sm text-white/70">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Memory & Session Status */}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Database className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-white/80">Eternal Memory</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className={`text-sm ${getMemoryStatusColor()}`}>{memoryCount} memories</span>
                <span className="text-sm">{getMemoryStatusIcon()}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Sparkles className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-white/80">Session Active</span>
              </div>
              <div className="flex items-center space-x-1">
                <span className="text-xs text-green-400">🔒 Secured</span>
              </div>
            </div>

            {/* Subtle session ID display for technical users */}
            <details className="text-xs">
              <summary className="cursor-pointer text-white/50 hover:text-white/70">Technical Details</summary>
              <div className="mt-2 p-2 bg-black/20 rounded text-xs">
                <div className="text-white/60">Session ID:</div>
                <div className="font-mono text-white/80 break-all text-[10px]">{sessionId}</div>
                <div className="text-white/50 mt-1">🔒 This ID never changes for your account</div>
              </div>
            </details>
          </div>

          {/* Actions */}
          <div className="p-2 border-t border-white/20">
            <button
              onClick={() => setShowDropdown(false)}
              className="flex items-center w-full px-3 py-2 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded"
            >
              <Settings className="h-4 w-4 mr-2" />
              Settings
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center w-full px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded"
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
