"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { RefreshCw } from "lucide-react"
import ChatInput from "./ChatInput"
import ChatMessage from "./ChatMessage"
import { Button } from "./ui/button"
import type { MemoryItem, Message } from "../lib/types"

interface ChatInterfaceProps {
  remainingToday: number
  onMessageSent: () => void
  onRemembered: (memories: MemoryItem[]) => void
  onSessionExpired: () => void
}

type ChatEvent =
  | { type: "text"; text: string }
  | { type: "remembered"; memories: MemoryItem[] }
  | { type: "error"; error: string }
  | { type: "done" }

export default function ChatInterface({ remainingToday, onMessageSent, onRemembered, onSessionExpired }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/history")
      .then((res) => {
        if (res.status === 401) onSessionExpired()
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
    // Load once per mount; the parent remounts this component for a new session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const updateAssistant = (id: string, update: (message: Message) => Message) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? update(m) : m)))
  }

  const handleRetry = () => {
    setError(null)
    const lastUserMessage = messages.findLast((msg) => msg.role === "user")
    if (lastUserMessage) setInput(lastUserMessage.content)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || isLoading) return

    const assistantId = crypto.randomUUID()
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
      { id: assistantId, role: "assistant", content: "" },
    ])
    setInput("")
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      })
      if (response.status === 401) {
        onSessionExpired()
        return
      }
      if (response.ok) onMessageSent()
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || "Failed to get a response")
      }

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
          if (event.type === "text") {
            updateAssistant(assistantId, (m) => ({ ...m, content: m.content + event.text }))
          } else if (event.type === "remembered") {
            updateAssistant(assistantId, (m) => ({ ...m, remembered: event.memories }))
            onRemembered(event.memories)
          } else if (event.type === "error") {
            throw new Error(event.error)
          }
        }
      }
    } catch (err) {
      // Drop an empty assistant bubble so the error stands on its own.
      setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content))
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  const waitingForFirstToken = isLoading && messages.at(-1)?.content === ""

  return (
    <div className="flex flex-col h-[70vh] glass-card rounded-xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-4" aria-live="polite">
        {!historyLoaded ? (
          <p className="text-center text-white/70 mt-10" role="status">
            Gathering your memories...
          </p>
        ) : messages.length === 0 ? (
          <div className="text-center text-white/70 mt-10">
            <p className="text-lg">Begin your eternal conversation...</p>
            <p className="text-sm mt-2 text-white/60">Tell me about yourself, and I&apos;ll remember it next time ✨</p>
          </div>
        ) : (
          messages
            .filter((message) => message.content || !waitingForFirstToken)
            .map((message) => <ChatMessage key={message.id} message={message} />)
        )}
        {waitingForFirstToken && (
          <div className="flex items-center space-x-3 text-white/70" role="status">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-purple-400"></div>
            <span>Consulting the cosmic memory...</span>
          </div>
        )}
        {error && (
          <div className="text-red-200 p-4 bg-red-500/20 rounded-lg border border-red-500/30" role="alert">
            <div className="flex items-start justify-between">
              <p className="flex-1">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="ml-3 text-red-200 border-red-400/50 hover:bg-red-500/20 bg-transparent"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Retry
              </Button>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-white/20 p-4 bg-white/5">
        <ChatInput
          input={input}
          handleInputChange={(e) => setInput(e.target.value)}
          handleSubmit={handleSubmit}
          isLoading={isLoading || !historyLoaded || remainingToday <= 0}
        />
        <p className="mt-2 text-xs text-white/60" aria-live="polite">
          {remainingToday > 0
            ? `Demo: ${remainingToday} message${remainingToday === 1 ? "" : "s"} left today`
            : "You've used today's demo messages. Come back tomorrow - I'll still remember you."}
        </p>
      </div>
    </div>
  )
}
