"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { MemoryItem, Message, RecalledMemory } from "./types"

type ChatEvent =
  | { type: "recalled"; memories: RecalledMemory[] }
  | { type: "text"; text: string }
  | { type: "remembered"; memories: MemoryItem[] }
  | { type: "error"; error: string }
  | { type: "done" }

export interface ChatCallbacks {
  onMessageSent: () => void
  onRecalled: (memories: RecalledMemory[]) => void
  onRemembered: (memories: MemoryItem[]) => void
  onSessionExpired: () => void
  /** A daily or rate limit was hit (HTTP 429). */
  onLimited?: () => void
}

export interface SendOptions {
  mode?: "text" | "voice"
  /** Called with each streamed piece of the reply, e.g. to speak it. */
  onTextDelta?: (text: string) => void
}

/**
 * Conversation state plus the one code path that sends a message and streams the
 * reply. Typed and spoken messages both go through `send`.
 */
export function useChat(callbacks: ChatCallbacks) {
  const [messages, setMessages] = useState<Message[]>([])
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const callbacksRef = useRef(callbacks)
  useEffect(() => {
    callbacksRef.current = callbacks
  })

  useEffect(() => {
    let cancelled = false
    fetch("/api/history")
      .then((res) => {
        if (res.status === 401) callbacksRef.current.onSessionExpired()
        return res.ok ? res.json() : Promise.reject(new Error("Could not load your conversation"))
      })
      .then((data: { messages: Message[] }) => {
        if (!cancelled) setMessages(data.messages)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setHistoryLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const updateMessage = (id: string, update: (message: Message) => Message) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? update(m) : m)))

  /** Sends a message and streams the reply. Resolves to the full reply, or null on failure. */
  const send = useCallback(async (text: string, options: SendOptions = {}): Promise<string | null> => {
    const message = text.trim()
    if (!message) return null
    const cb = callbacksRef.current

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: message },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setIsSending(true)
    setError(null)
    let reply = ""

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, mode: options.mode ?? "text" }),
      })
      if (response.status === 401) {
        cb.onSessionExpired()
        return null
      }
      if (response.status === 429) cb.onLimited?.()
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to get a response")
      }
      cb.onMessageSent()

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        const events = buffer.split("\n\n")
        buffer = events.pop() ?? ""
        for (const raw of events) {
          if (!raw.startsWith("data: ")) continue
          const event = JSON.parse(raw.slice(6)) as ChatEvent
          if (event.type === "recalled") {
            updateMessage(assistantId, (m) => ({ ...m, recalled: event.memories }))
            cb.onRecalled(event.memories)
          } else if (event.type === "text") {
            reply += event.text
            updateMessage(assistantId, (m) => ({ ...m, content: m.content + event.text }))
            options.onTextDelta?.(event.text)
          } else if (event.type === "remembered") {
            updateMessage(assistantId, (m) => ({ ...m, remembered: event.memories }))
            cb.onRemembered(event.memories)
          } else if (event.type === "error") {
            throw new Error(event.error)
          }
        }
      }
      return reply
    } catch (err) {
      // Drop an empty assistant bubble so the error stands on its own.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content))
      setError(err instanceof Error ? err.message : "Something went wrong")
      return null
    } finally {
      setIsSending(false)
    }
  }, [])

  const lastUserMessage = messages.findLast((m) => m.role === "user")?.content ?? ""

  return { messages, historyLoaded, isSending, error, clearError: () => setError(null), send, lastUserMessage }
}
