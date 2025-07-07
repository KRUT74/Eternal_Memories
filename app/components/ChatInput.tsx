"use client"

import type React from "react"

import { useState, useRef } from "react"
import FileUpload from "./FileUpload"
import { Button } from "../components/ui/button"
import { Textarea } from "../components/ui/textarea"
import { PlaneIcon as PaperAirplaneIcon, PaperclipIcon } from "lucide-react"

interface ChatInputProps {
  input: string
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isLoading: boolean
  onFileChange: (files: File[]) => void
  files: File[]
}

export default function ChatInput({
  input,
  handleInputChange,
  handleSubmit,
  isLoading,
  onFileChange,
  files,
}: ChatInputProps) {
  const [showFileUpload, setShowFileUpload] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (input.trim()) {
        const form = e.currentTarget.form
        if (form) form.requestSubmit()
      }
    }
  }

  const toggleFileUpload = () => {
    setShowFileUpload(!showFileUpload)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {showFileUpload && (
        <FileUpload onFileChange={onFileChange} files={files} onClose={() => setShowFileUpload(false)} />
      )}

      <div className="flex items-end space-x-2">
        <Button type="button" variant="outline" size="icon" onClick={toggleFileUpload} className="flex-shrink-0">
          <PaperclipIcon className="h-4 w-4" />
        </Button>

        <div className="relative flex-grow">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="resize-none pr-10"
            rows={1}
            disabled={isLoading}
          />
        </div>

        <Button type="submit" disabled={isLoading || !input.trim()} className="flex-shrink-0">
          <PaperAirplaneIcon className="h-4 w-4" />
        </Button>
      </div>

      {files.length > 0 && <div className="text-sm text-gray-500">{files.length} file(s) attached</div>}
    </form>
  )
}
