import ReactMarkdown from "react-markdown"
import type { Message } from "../lib/types"

export default function ChatMessage({ message }: { message: Message }) {
  const isUser = message.role === "user"

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[80%] rounded-lg p-3 ${isUser ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-800"}`}>
        <div className="text-sm font-semibold mb-1">{isUser ? "You" : "AI"}</div>
        <div className="text-sm">
          <ReactMarkdown>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  )
}
