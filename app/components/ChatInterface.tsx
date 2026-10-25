"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { RefreshCw } from "lucide-react"
import ChatInput from "./ChatInput"
import ChatMessage from "./ChatMessage"
import { Button } from "./ui/button"
import type { Message, User } from "../lib/types"

interface ChatInterfaceProps {
  sessionId: string
  user: User
}

// Chat history lives in localStorage until the Phase 2 memory backend lands.
const storageKey = (sessionId: string) => `messages_${sessionId}`

function loadMessages(sessionId: string): Message[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(sessionId)) ?? "[]")
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function ChatInterface({ sessionId, user }: ChatInterfaceProps) {
  // Mounted client-side only (keyed by sessionId), so reading localStorage here is safe.
  const [messages, setMessages] = useState<Message[]>(() => loadMessages(sessionId))
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const updateMessages = (next: Message[]) => {
    setMessages(next)
    localStorage.setItem(storageKey(sessionId), JSON.stringify(next))
  }

  const handleRetry = () => {
    setError(null)
    const lastUserMessage = messages.findLast((msg) => msg.role === "user")
    if (lastUserMessage) setInput(lastUserMessage.content)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim()) return

    const newMessages = [...messages, { id: crypto.randomUUID(), role: "user" as const, content: input }]
    updateMessages(newMessages)
    setInput("")
    setIsLoading(true)
    setError(null)

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, sessionId, user }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to get response")

      updateMessages([...newMessages, { id: crypto.randomUUID(), role: "assistant", content: data.content }])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[70vh] glass-card rounded-xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-4" aria-live="polite">
        {messages.length === 0 ? (
          <div className="text-center text-white/70 mt-10">
            <p className="text-lg">Begin your eternal conversation...</p>
            <p className="text-sm mt-2 text-white/60">Your memories will be preserved across time and space ✨</p>
          </div>
        ) : (
          messages.map((message) => <ChatMessage key={message.id} message={message} />)
        )}
        {isLoading && (
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
        <ChatInput input={input} handleInputChange={(e) => setInput(e.target.value)} handleSubmit={handleSubmit} isLoading={isLoading} />
      </div>
    </div>
  )
}
