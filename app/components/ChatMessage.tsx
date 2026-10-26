"use client"

import { useState } from "react"
import ReactMarkdown from "react-markdown"
import { SHAPING_MEMORIES, type Message } from "../lib/types"

export default function ChatMessage({ message }: { message: Message }) {
  const [showAllRecalled, setShowAllRecalled] = useState(false)

  if (message.role === "user") {
    return (
      <div className="self-end max-w-[85%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-user-bubble px-4 py-2.5 whitespace-pre-wrap">
        <span className="sr-only">You said: </span>
        {message.content}
      </div>
    )
  }

  const recalled = message.recalled ?? []
  const visibleRecalled = showAllRecalled ? recalled : recalled.slice(0, SHAPING_MEMORIES)
  const hiddenCount = recalled.length - visibleRecalled.length

  return (
    <div className="max-w-[92%] sm:max-w-[85%]">
      <div className="font-mono text-[11px] tracking-wider text-star mb-1">ETERNAL MEMORIES</div>
      <div className="reply-prose leading-relaxed">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>

      {(recalled.length > 0 || (message.remembered?.length ?? 0) > 0) && (
        <ul className="mt-2.5 flex flex-wrap gap-1.5 text-xs" aria-label="Memories for this reply">
          {visibleRecalled.map((m) => (
            <li
              key={m.id}
              className="rounded-full border border-star/35 bg-star-soft px-2.5 py-0.5 text-[#f7dca4]"
              title={`Recalled · similarity ${m.similarity.toFixed(2)}`}
            >
              <span aria-hidden="true">★ </span>
              <span className="sr-only">Recalled: </span>
              {m.content}
            </li>
          ))}
          {hiddenCount > 0 && (
            <li>
              <button
                type="button"
                onClick={() => setShowAllRecalled(true)}
                className="rounded-full border border-line px-2.5 py-0.5 text-muted hover:text-text"
              >
                +{hiddenCount} more recalled
              </button>
            </li>
          )}
          {message.remembered?.map((m) => (
            <li key={m.id} className="rounded-full border border-teal/40 bg-teal-soft px-2.5 py-0.5 text-[#a9e2da]">
              + New star: {m.content}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
