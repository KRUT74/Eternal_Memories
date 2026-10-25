"use client"

import { useCallback, useEffect, useState } from "react"
import ChatInterface from "./components/ChatInterface"
import WelcomeForm from "./components/WelcomeForm"
import UserProfile from "./components/UserProfile"
import CosmicParticles from "./components/CosmicParticles"
import MemoryPanel from "./components/MemoryPanel"
import type { SessionInfo } from "./lib/types"

type SessionState = { status: "loading" } | { status: "anonymous" } | { status: "active"; session: SessionInfo }

export default function Home() {
  const [state, setState] = useState<SessionState>({ status: "loading" })
  const [memoryVersion, setMemoryVersion] = useState(0)
  // Bumped on each new session so the chat remounts and reloads its history.
  const [sessionVersion, setSessionVersion] = useState(0)

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/session")
      if (res.ok) {
        setState({ status: "active", session: (await res.json()) as SessionInfo })
      } else {
        setState({ status: "anonymous" })
      }
    } catch {
      setState({ status: "anonymous" })
    }
  }, [])

  useEffect(() => {
    // Earlier versions kept the user and chat history in localStorage; clear those leftovers.
    try {
      for (const key of Object.keys(localStorage)) {
        if (key === "chat_user" || key === "chatSessionId" || key.startsWith("session_") || key.startsWith("messages_")) {
          localStorage.removeItem(key)
        }
      }
    } catch {
      // Storage can be unavailable (private mode, blocked site data); nothing to clean then.
    }
  }, [])

  useEffect(() => {
    // Reading the httpOnly session cookie requires a server round trip.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSession()
  }, [loadSession])

  const signedOut = () => {
    setState({ status: "anonymous" })
    setSessionVersion((v) => v + 1)
  }

  const messageSent = () =>
    setState((s) =>
      s.status === "active" ? { ...s, session: { ...s.session, remainingToday: Math.max(0, s.session.remainingToday - 1) } } : s,
    )

  if (state.status === "loading") {
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
          {state.status === "active" && <UserProfile name={state.session.name} onForgotten={signedOut} />}
        </div>

        {state.status === "anonymous" ? (
          <div className="glass-card-strong rounded-2xl p-2 max-w-3xl mx-auto">
            <WelcomeForm
              onStarted={() => {
                setSessionVersion((v) => v + 1)
                void loadSession()
              }}
            />
          </div>
        ) : (
          <>
            <div className="mb-6 text-sm text-white/70 glass-card rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <span>Welcome back,</span>
                <span className="font-medium text-white">{state.session.name}</span>
                <span aria-hidden="true">✨</span>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="glass-card-strong rounded-2xl p-2">
                <ChatInterface
                  key={sessionVersion}
                  remainingToday={state.session.remainingToday}
                  onMessageSent={messageSent}
                  onRemembered={() => setMemoryVersion((v) => v + 1)}
                  onSessionExpired={signedOut}
                />
              </div>
              <MemoryPanel key={sessionVersion} refreshKey={memoryVersion} />
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
