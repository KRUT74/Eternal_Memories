"use client"

import type { Message } from "../lib/types"
import ReactMarkdown from "react-markdown"
import type { WebhookStatus } from "../lib/types"

interface ChatMessageProps {
  message: Message
  webhookStatus?: WebhookStatus
}

export default function ChatMessage({ message, webhookStatus }: ChatMessageProps) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
        <div className="text-sm font-semibold mb-1">{isUser ? "You" : "AI"}</div>
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown>
            {typeof message.content === "string"
              ? message.content
              : message.content.map((part) => (part.type === "text" ? part.text : "")).join("")}
          </ReactMarkdown>
        </div>

        {webhookStatus && (
          <div
            className={`mt-2 text-xs ${
              webhookStatus.status === "completed"
                ? "text-green-500"
                : webhookStatus.status === "failed"
                  ? "text-red-500"
                  : "text-gray-500"
            }`}
          >
            {webhookStatus.status === "pending" && (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-b-2 border-current mr-1"></div>
                {webhookStatus.message}
              </div>
            )}
            {webhookStatus.status !== "pending" && webhookStatus.message}
          </div>
        )}
      </div>
    </div>
  )
}
