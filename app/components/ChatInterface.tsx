"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import ChatInput from "./ChatInput"
import ChatMessage from "./ChatMessage"
import { v4 as uuidv4 } from "uuid"
import type { WebhookStatus, Message } from "../lib/types"
import { Button } from "./ui/button"
import { RefreshCw } from "lucide-react"

interface User {
  id: string
  name: string
  email: string
}

interface ChatInterfaceProps {
  sessionId: string
  user: User
}

export default function ChatInterface({ sessionId, user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [webhookStatus, setWebhookStatus] = useState<Record<string, WebhookStatus>>({})
  const [files, setFiles] = useState<File[]>([])
  const [retryCount, setRetryCount] = useState(0)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }

  const handleRetry = () => {
    if (error) {
      setError(null)
      setRetryCount((prev) => prev + 1)
      // Re-submit the last message
      const lastUserMessage = messages.findLast((msg) => msg.role === "user")
      if (lastUserMessage) {
        setInput(typeof lastUserMessage.content === "string" ? lastUserMessage.content : "")
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!input.trim()) return

    // Generate a new request ID for this message
    const requestId = uuidv4()
    const userMessage: Message = {
      id: requestId,
      role: "user",
      content: input,
    }

    // Add user message to the chat
    setMessages((prev) => [...prev, userMessage])

    // Clear input and set loading state
    setInput("")
    setIsLoading(true)
    setError(null)

    try {
      // Send the message to our API
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          sessionId,
          requestId,
          user,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to get response")
      }

      // Get the request ID from the response headers
      const responseRequestId = response.headers.get("x-request-id")
      if (responseRequestId) {
        setWebhookStatus((prev) => ({
          ...prev,
          [responseRequestId]: { status: "pending", message: "Processing response..." },
        }))
      }

      // Process the streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("Failed to get response stream")
      }

      let done = false
      let buffer = ""

      while (!done) {
        const { value, done: doneReading } = await reader.read()
        done = doneReading

        if (value) {
          buffer += decoder.decode(value, { stream: true })

          // Process complete lines
          const lines = buffer.split("\n")
          buffer = lines.pop() || "" // Keep the incomplete line in buffer

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.substring(6).trim()
              if (data === "[DONE]") {
                continue
              }

              try {
                const parsedData = JSON.parse(data)

                if (parsedData.type === "message") {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: parsedData.id,
                      role: parsedData.role,
                      content: parsedData.content,
                    },
                  ])
                } else if (parsedData.type === "status") {
                  setWebhookStatus((prev) => ({
                    ...prev,
                    [requestId]: {
                      status: parsedData.status,
                      message: parsedData.message,
                    },
                  }))
                } else if (parsedData.type === "error") {
                  setError(new Error(parsedData.error))
                }
              } catch (e) {
                console.error("Error parsing SSE data:", e, "Data was:", data)
              }
            }
          }
        }
      }

      // Update webhook status to completed
      setWebhookStatus((prev) => ({
        ...prev,
        [requestId]: { status: "completed", message: "Response received" },
      }))

      // Reset retry count on success
      setRetryCount(0)
    } catch (err) {
      console.error("Error sending message:", err)
      setError(err instanceof Error ? err : new Error("An unknown error occurred"))

      setWebhookStatus((prev) => ({
        ...prev,
        [requestId]: { status: "failed", message: err instanceof Error ? err.message : "Failed to get response" },
      }))
    } finally {
      setIsLoading(false)
      setFiles([])
    }
  }

  const handleFileChange = (newFiles: File[]) => {
    setFiles(newFiles)
  }

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  return (
    <div className="flex flex-col h-[70vh] glass-card rounded-xl overflow-hidden">
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center text-white/70 mt-10">
            <p className="text-lg">Begin your eternal conversation...</p>
            <p className="text-sm mt-2 text-white/50">Your memories will be preserved across time and space ✨</p>
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} webhookStatus={webhookStatus[message.id]} />
          ))
        )}
        {isLoading && (
          <div className="flex items-center space-x-3 text-white/70">
            <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-purple-400"></div>
            <span>Consulting the cosmic memory...</span>
          </div>
        )}
        {error && (
          <div className="text-red-300 p-4 bg-red-500/20 rounded-lg border border-red-500/30">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="font-medium">🌌 Cosmic interference detected:</p>
                <p className="mt-1">{error.message || "Something went wrong"}</p>
                <p className="text-xs mt-2 text-red-200">
                  This could be due to webhook connectivity issues. Try again or check the system status.
                </p>
                {retryCount > 0 && <p className="text-xs text-red-200">Retry attempt: {retryCount}</p>}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="ml-3 text-red-300 border-red-400/50 hover:bg-red-500/20"
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
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          isLoading={isLoading}
          onFileChange={handleFileChange}
          files={files}
        />
      </div>
    </div>
  )
}
