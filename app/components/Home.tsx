"use client"

import { useCallback, useEffect, useState } from "react"
import { Sparkles } from "lucide-react"
import ChatInterface from "./ChatInterface"
import WelcomeForm from "./WelcomeForm"
import UserProfile from "./UserProfile"
import MemoryPanel from "./MemoryPanel"
import HowItWorks from "./HowItWorks"
import { SHAPING_MEMORIES } from "../lib/types"

// remainingToday is null until the client has fetched it.
type ActiveSession = { name: string; remainingToday: number | null }
type SessionState = { status: "anonymous" } | { status: "active"; session: ActiveSession }

const EMPTY = new Set<string>()

/** The whole app. The server passes the visitor's name when their session cookie is valid. */
export default function Home({ initialName }: { initialName: string | null }) {
  const [state, setState] = useState<SessionState>(
    initialName ? { status: "active", session: { name: initialName, remainingToday: null } } : { status: "anonymous" },
  )
  const [memoryVersion, setMemoryVersion] = useState(0)
  // Bumped on each new session so the chat and panel remount and reload.
  const [sessionVersion, setSessionVersion] = useState(0)
  const [memoryCount, setMemoryCount] = useState(0)
  const [shapingIds, setShapingIds] = useState<Set<string>>(EMPTY)
  const [newIds, setNewIds] = useState<Set<string>>(EMPTY)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const loadSession = useCallback(async () => {
    try {
      const res = await fetch("/api/session")
      if (res.ok) {
        setState({ status: "active", session: (await res.json()) as ActiveSession })
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

  useEffect(() => {
    if (!drawerOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerOpen(false)
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [drawerOpen])

  const signedOut = () => {
    setState({ status: "anonymous" })
    setSessionVersion((v) => v + 1)
    setShapingIds(EMPTY)
    setNewIds(EMPTY)
  }

  const messageSent = () => {
    setNewIds(EMPTY)
    setState((s) =>
      s.status === "active"
        ? {
            ...s,
            session: {
              ...s.session,
              remainingToday: s.session.remainingToday === null ? null : Math.max(0, s.session.remainingToday - 1),
            },
          }
        : s,
    )
  }

  const onCountChange = useCallback((count: number) => setMemoryCount(count), [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <h1 className="font-serif text-[28px] leading-none sm:text-3xl">
          Eternal <i className="text-star">Memories</i>
        </h1>
        {state.status === "active" && (
          <div className="flex items-center gap-2">
            <span className="hidden font-mono text-xs text-muted sm:inline">
              {memoryCount} {memoryCount === 1 ? "memory" : "memories"}
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-expanded={drawerOpen}
              aria-controls="constellation-panel"
              className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 font-mono text-xs text-star md:hidden"
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              {memoryCount}
              <span className="sr-only">memories, open constellation</span>
            </button>
            <UserProfile name={state.session.name} onForgotten={signedOut} />
          </div>
        )}
      </header>

      <main className="flex-1 pb-6">
        {state.status === "anonymous" ? (
          <div className="mt-6 sm:mt-12">
            <WelcomeForm
              onStarted={() => {
                setSessionVersion((v) => v + 1)
                void loadSession()
              }}
            />
            <HowItWorks />
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_21rem]">
            <section aria-label="Conversation" className="rounded-3xl border border-line bg-surface/90 p-3 sm:p-5">
              <ChatInterface
                key={sessionVersion}
                remainingToday={state.session.remainingToday}
                onMessageSent={messageSent}
                onRecalled={(memories) => setShapingIds(new Set(memories.slice(0, SHAPING_MEMORIES).map((m) => m.id)))}
                onRemembered={(memories) => {
                  setNewIds(new Set(memories.map((m) => m.id)))
                  setMemoryVersion((v) => v + 1)
                }}
                onSessionExpired={signedOut}
              />
            </section>

            {drawerOpen && (
              <div className="fixed inset-0 z-30 bg-black/60 md:hidden" aria-hidden="true" onClick={() => setDrawerOpen(false)} />
            )}
            <aside
              id="constellation-panel"
              className={`fixed inset-y-0 right-0 z-40 w-[min(22rem,90vw)] overflow-y-auto border-l border-line bg-surface p-5 transition-transform duration-300 motion-reduce:transition-none md:static md:z-auto md:w-auto md:translate-x-0 md:rounded-3xl md:border md:bg-surface/90 md:visible ${
                drawerOpen ? "translate-x-0" : "invisible translate-x-full"
              }`}
            >
              <MemoryPanel
                key={sessionVersion}
                refreshKey={memoryVersion}
                shapingIds={shapingIds}
                newIds={newIds}
                onCountChange={onCountChange}
                onClose={() => setDrawerOpen(false)}
              />
            </aside>
          </div>
        )}
      </main>
    </div>
  )
}
