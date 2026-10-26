"use client"

import type React from "react"
import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import ChatInput from "./ChatInput"
import ChatMessage from "./ChatMessage"
import VoiceBar from "./VoiceBar"
import { useChat, type ChatCallbacks } from "../lib/useChat"
import { useVoiceConversation } from "../lib/voice/useVoiceConversation"

interface ChatInterfaceProps extends ChatCallbacks {
  /** Messages left today, or null while still loading. */
  remainingToday: number | null
}

export default function ChatInterface({ remainingToday, ...callbacks }: ChatInterfaceProps) {
  const chat = useChat(callbacks)
  const voice = useVoiceConversation({ send: chat.send })
  const [input, setInput] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, historyLoaded, isSending, error } = chat

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!input.trim() || isSending) return
    const text = input
    setInput("")
    void chat.send(text)
  }

  const handleRetry = () => {
    chat.clearError()
    setInput(chat.lastUserMessage)
  }

  const waitingForFirstToken = isSending && messages.at(-1)?.content === ""
  const outOfMessages = remainingToday !== null && remainingToday <= 0

  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[28rem] flex-col md:h-[min(72vh,52rem)]">
      <div className="flex-1 space-y-5 overflow-y-auto px-1 pb-4 sm:px-2" aria-live="polite">
        {!historyLoaded ? (
          <p className="mt-10 text-center text-muted" role="status">
            Gathering your memories…
          </p>
        ) : messages.length === 0 ? (
          <div className="mx-auto mt-12 max-w-sm text-center">
            <p className="font-serif text-2xl">Every conversation leaves a star.</p>
            <p className="mt-2 text-sm text-muted">
              Tell me about the people, plans and things you care about. I&apos;ll remember them next time.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages
              .filter((m) => m.content || !waitingForFirstToken)
              .map((message) => (
                <ChatMessage key={message.id} message={message} />
              ))}
          </div>
        )}
        {waitingForFirstToken && (
          <div className="flex items-center gap-3 text-muted" role="status">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-star" aria-hidden="true" />
            Reaching for the right memories…
          </div>
        )}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-[#fbd0d0]" role="alert">
            <p className="flex-1">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="flex items-center gap-1 rounded-lg border border-danger/40 px-2 py-1 text-xs hover:bg-danger/10"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Try again
            </button>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="pt-2">
        {voice.status !== "idle" ? (
          <VoiceBar status={voice.status} partial={voice.partial} hint={voice.hint} level={voice.level} onEnd={() => voice.stop()} />
        ) : (
          <ChatInput
            input={input}
            onInputChange={setInput}
            onSubmit={handleSubmit}
            disabled={isSending || !historyLoaded || outOfMessages}
            onStartVoice={() => void voice.start()}
          />
        )}
        {voice.error && (
          <p className="mt-2 flex items-start gap-2 text-xs text-danger" role="alert">
            <span className="flex-1">{voice.error}</span>
            <button type="button" onClick={voice.clearError} className="underline">
              Dismiss
            </button>
          </p>
        )}
        <p className="mt-2 font-mono text-[11px] text-muted" aria-live="polite">
          {remainingToday === null
            ? "demo"
            : outOfMessages
              ? "demo · today's messages are used up. Come back tomorrow, I'll still remember you."
              : `demo · ${remainingToday} message${remainingToday === 1 ? "" : "s"} left today`}
        </p>
      </div>
    </div>
  )
}
