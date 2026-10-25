"use client"

import type React from "react"
import { Button } from "./ui/button"
import { Textarea } from "./ui/textarea"
import { SendHorizontal } from "lucide-react"

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
}

export default function ChatInput({ input, handleInputChange, handleSubmit, isLoading }: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) e.currentTarget.form?.requestSubmit()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2">
      <Textarea
        value={input}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        placeholder="Type your message..."
        aria-label="Message"
        className="resize-none grow"
        rows={1}
        disabled={isLoading}
      />
      <Button type="submit" disabled={isLoading || !input.trim()} className="shrink-0" aria-label="Send message">
        <SendHorizontal className="h-4 w-4" />
      </Button>
    </form>
  )
}
