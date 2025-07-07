"use client"

import { useState, useEffect } from "react"
import ChatInterface from "./components/ChatInterface"
import AuthForm from "./components/AuthForm"
import UserProfile from "./components/UserProfile"
import CosmicParticles from "./components/CosmicParticles"
import { getOrCreateSessionId, validateSessionId, recoverSessionId } from "./lib/utils"

interface User {
  id: string
  name: string
  email: string
}

export default function Home() {
  const [sessionId, setSessionId] = useState<string>("")
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [sessionValidated, setSessionValidated] = useState(false)

  useEffect(() => {
    // Check if user is already authenticated
    if (typeof window !== "undefined") {
      const storedUser = localStorage.getItem("chat_user")
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser)
          setUser(parsedUser)

          // Use the robust session ID system
          const userSessionId = getOrCreateSessionId(parsedUser)

          // Validate the session ID
          const isValid = validateSessionId(parsedUser, userSessionId)
          if (!isValid) {
            console.warn("Session ID validation failed, attempting recovery...")
            const recoveredSessionId = recoverSessionId(parsedUser)
            setSessionId(recoveredSessionId)
          } else {
            setSessionId(userSessionId)
          }

          setSessionValidated(true)

          console.log(`🔐 Session established for ${parsedUser.email}: ${userSessionId}`)
        } catch (error) {
          console.error("Error parsing stored user:", error)
          localStorage.removeItem("chat_user")
          localStorage.removeItem("chatSessionId")
        }
      }
      setIsLoading(false)
    }
  }, [])

  const handleAuth = (authenticatedUser: User) => {
    setUser(authenticatedUser)

    // Use the robust session ID system
    const userSessionId = getOrCreateSessionId(authenticatedUser)
    setSessionId(userSessionId)
    setSessionValidated(true)

    console.log(`🚀 User ${authenticatedUser.email} authenticated with session ID: ${userSessionId}`)
  }

  const handleLogout = () => {
    setUser(null)
    setSessionId("")
    setSessionValidated(false)
    // Note: We don't clear the user-specific session ID storage on logout
    // This preserves the session ID for when the user logs back in
    localStorage.removeItem("chatSessionId")
  }

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 relative">
        <CosmicParticles />
        <div className="glass-card p-8 rounded-2xl">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400 mx-auto"></div>
          <p className="mt-4 text-white/80">Connecting to the cosmos...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24 relative">
      <CosmicParticles />

      <div className="z-10 w-full max-w-3xl relative">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold cosmic-title">ETERNAL MEMORIES AI</h1>
          {user && <UserProfile user={user} sessionId={sessionId} onLogout={handleLogout} />}
        </div>

        {!user ? (
          <div className="glass-card-strong rounded-2xl p-2">
            <AuthForm onAuth={handleAuth} />
          </div>
        ) : (
          <>
            <div className="mb-6 text-sm text-white/70 glass-card rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <span>Welcome back,</span>
                <span className="font-medium text-white">{user.name}</span>
                <span>✨</span>
              </div>
              <div className="text-xs text-white/50 mt-1">Your eternal memories are preserved and ready</div>
            </div>

            <div className="glass-card-strong rounded-2xl p-2">
              <ChatInterface sessionId={sessionId} user={user} />
            </div>
          </>
        )}
      </div>

      {/* Cosmic footer */}
      <div className="text-center text-white/50 text-xs mt-8">
        <p>Where memories transcend time and space ✨</p>
      </div>
    </main>
  )
}
