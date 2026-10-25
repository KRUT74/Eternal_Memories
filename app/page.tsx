"use client"

import { useMemo, useState } from "react"
import ChatInterface from "./components/ChatInterface"
import AuthForm from "./components/AuthForm"
import UserProfile from "./components/UserProfile"
import CosmicParticles from "./components/CosmicParticles"
import MemoryPanel from "./components/MemoryPanel"
import { getOrCreateSessionId } from "./lib/utils"
import { useStoredUser, setStoredUser } from "./lib/storedUser"

export default function Home() {
  const user = useStoredUser()
  const isLoading = user === undefined
  const sessionId = useMemo(() => (user ? getOrCreateSessionId(user) : ""), [user])
  const [memoryVersion, setMemoryVersion] = useState(0)

  if (isLoading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-4 relative">
        <CosmicParticles />
        <div className="glass-card p-8 rounded-2xl" role="status">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-400 mx-auto"></div>
          <p className="mt-4 text-white/80">Connecting to the cosmos...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24 relative">
      <CosmicParticles />

      <div className="z-10 w-full max-w-5xl relative">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold cosmic-title">ETERNAL MEMORIES AI</h1>
          {user && <UserProfile user={user} onLogout={() => setStoredUser(null)} />}
        </div>

        {!user ? (
          <div className="glass-card-strong rounded-2xl p-2 max-w-3xl mx-auto">
            <AuthForm onAuth={setStoredUser} />
          </div>
        ) : (
          <>
            <div className="mb-6 text-sm text-white/70 glass-card rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <span>Welcome back,</span>
                <span className="font-medium text-white">{user.name}</span>
                <span aria-hidden="true">✨</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="glass-card-strong rounded-2xl p-2">
                <ChatInterface
                  key={sessionId}
                  sessionId={sessionId}
                  user={user}
                  onRemembered={() => setMemoryVersion((v) => v + 1)}
                />
              </div>
              <MemoryPanel sessionId={sessionId} refreshKey={memoryVersion} />
            </div>
          </>
        )}
      </div>

      <footer className="text-center text-white/60 text-xs mt-8">
        <p>Where memories transcend time and space ✨</p>
      </footer>
    </main>
  )
}
