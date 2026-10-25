import type Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { anthropic, CHAT_MODEL } from "@/lib/server/anthropic"
import { recentMessages, saveMessage } from "@/lib/server/history"
import { extractAndStore, recall } from "@/lib/server/memory"

export const maxDuration = 60

const HISTORY_TURNS = 20

const RequestSchema = z.object({
  userId: z.string().min(1).max(200),
  userName: z.string().min(1).max(100),
  message: z.string().trim().min(1).max(4000),
})

const SYSTEM_PROMPT = `You are Eternal Memories, a warm and thoughtful companion who remembers the people you talk with across conversations.

Before each reply you may be given a short list of things you remember about this person from earlier conversations. Use them the way a good friend would: bring them up when they're relevant, connect new news to what you already know, and never recite the list back. If something you remember seems out of date, ask rather than assume. Never claim to remember anything that isn't in the list or the conversation.

Keep replies conversational and reasonably short unless the person asks for depth. Use Markdown only when it genuinely helps.`

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "remembered"; memories: { id: string; content: string }[] }
  | { type: "error"; error: string }
  | { type: "done" }

export async function POST(req: Request) {
  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Invalid request" }, { status: 400 })
  }
  const { userId, userName, message } = parsed.data

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))

      try {
        const [history, memories] = await Promise.all([recentMessages(userId, HISTORY_TURNS), recall(userId, message)])
        await saveMessage(userId, "user", message)

        const memoryNote = memories.length
          ? `What you remember about ${userName}:\n${memories.map((m) => `- ${m.content}`).join("\n")}`
          : `You don't remember anything relevant about ${userName} yet.`

        const messages: Anthropic.Beta.BetaMessageParam[] = [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user", content: message },
          // Mid-conversation system message: keeps the top-level system prompt
          // stable and marks recalled memories as operator context, not user text.
          { role: "system", content: memoryNote },
        ]

        const response = anthropic().beta.messages.stream({
          model: CHAT_MODEL,
          max_tokens: 4096,
          output_config: { effort: "low" },
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: SYSTEM_PROMPT,
          messages,
        })

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            send({ type: "text", text: event.delta.text })
          }
        }

        const final = await response.finalMessage()
        if (final.stop_reason === "refusal") {
          send({ type: "error", error: "I can't help with that one. Let's talk about something else." })
          send({ type: "done" })
          return
        }

        const reply = final.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("")
          .trim()
        if (!reply) throw new Error("Empty reply from model")

        const saved = await saveMessage(userId, "assistant", reply)

        try {
          const stored = await extractAndStore(userId, message, reply, memories, saved.id)
          if (stored.length) {
            send({ type: "remembered", memories: stored.map(({ id, content }) => ({ id, content })) })
          }
        } catch (error) {
          // The reply already reached the user; a failed memory update shouldn't surface as an error.
          console.error("Memory extraction failed", error)
        }

        send({ type: "done" })
      } catch (error) {
        console.error("Chat request failed", error)
        send({ type: "error", error: "Something went wrong reaching the memory service. Please try again." })
        send({ type: "done" })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  })
}
