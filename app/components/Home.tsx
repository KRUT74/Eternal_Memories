"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Sparkles } from "lucide-react"
import ChatInterface from "./ChatInterface"
import UserProfile from "./UserProfile"
import MemoryPanel from "./MemoryPanel"
import SignInCard from "./SignInCard"
import { SHAPING_MEMORIES } from "../lib/types"

export interface AppSession {
  name: string
  kind: "guest" | "email"
  email: string | null
}

const EMPTY = new Set<string>()

/** The signed-in app. The server only renders this with a valid session. */
export default function Home({ session, emailSignInEnabled }: { session: AppSession; emailSignInEnabled: boolean }) {
  const router = useRouter()
  /** Back to the landing page, re-rendered on the server so it sees the new cookie state. */
  const goHome = useCallback(() => {
    router.push("/")
    router.refresh()
  }, [router])
  // null until fetched from the server.
  const [remainingToday, setRemainingToday] = useState<number | null>(null)
  const [memoryVersion, setMemoryVersion] = useState(0)
  const [memoryCount, setMemoryCount] = useState(0)
  const [shapingIds, setShapingIds] = useState<Set<string>>(EMPTY)
  const [newIds, setNewIds] = useState<Set<string>>(EMPTY)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [upgradeOpen, setUpgradeOpen] = useState(false)

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
    let cancelled = false
    fetch("/api/session")
      .then((res) => {
        if (res.status === 401) goHome()
        return res.ok ? res.json() : null
      })
      .then((data: { remainingToday: number } | null) => {
        if (!cancelled && data) setRemainingToday(data.remainingToday)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [goHome])

  useEffect(() => {
    if (!drawerOpen && !upgradeOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setDrawerOpen(false)
      setUpgradeOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [drawerOpen, upgradeOpen])

  const messageSent = () => {
    setNewIds(EMPTY)
    setRemainingToday((r) => (r === null ? null : Math.max(0, r - 1)))
  }

  const onCountChange = useCallback((count: number) => setMemoryCount(count), [])

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between gap-4 py-5">
        <Link href="/" className="font-serif text-[28px] leading-none sm:text-3xl">
          Eternal <i className="text-star">Memories</i>
        </Link>
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
          <UserProfile
            session={session}
            canUpgrade={session.kind === "guest" && emailSignInEnabled}
            onUpgrade={() => setUpgradeOpen(true)}
            onSignedOut={goHome}
          />
        </div>
      </header>

      <main className="flex-1 pb-6">
        <h1 className="sr-only">Your conversation</h1>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_21rem]">
          <section aria-label="Conversation" className="rounded-3xl border border-line bg-surface/90 p-3 sm:p-5">
            <ChatInterface
              remainingToday={remainingToday}
              onMessageSent={messageSent}
              onRecalled={(memories) => setShapingIds(new Set(memories.slice(0, SHAPING_MEMORIES).map((m) => m.id)))}
              onRemembered={(memories) => {
                setNewIds(new Set(memories.map((m) => m.id)))
                setMemoryVersion((v) => v + 1)
              }}
              onSessionExpired={goHome}
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
              refreshKey={memoryVersion}
              shapingIds={shapingIds}
              newIds={newIds}
              onCountChange={onCountChange}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </div>
      </main>

      {upgradeOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={() => setUpgradeOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sign-in-title"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <SignInCard
              mode="upgrade"
              emailSignInEnabled={emailSignInEnabled}
              onSignedIn={() => {
                setUpgradeOpen(false)
                router.refresh()
              }}
              onCancel={() => setUpgradeOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
