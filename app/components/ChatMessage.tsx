import ReactMarkdown from "react-markdown"
import { Sparkles } from "lucide-react"
import type { Message } from "../lib/types"

export default function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
        <div className="text-sm font-semibold mb-1">{isUser ? "You" : "AI"}</div>
        <div className="text-sm space-y-2">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
      {message.remembered && message.remembered.length > 0 && (
        <div className="mt-1 max-w-[80%] flex items-start gap-1.5 text-xs text-purple-200">
          <Sparkles className="h-3 w-3 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Remembered: </span>
            {message.remembered.map((m) => m.content).join(" · ")}
          </span>
        </div>
      )}
    </div>
  )
}
