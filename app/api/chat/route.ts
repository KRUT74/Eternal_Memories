import type Anthropic from "@anthropic-ai/sdk"
import { after } from "next/server"
import { z } from "zod"
import { anthropic, CHAT_MODEL } from "@/lib/server/anthropic"
import { describeMemories, describeNow, historyForClaude, replyNote, SYSTEM_PROMPT } from "@/lib/server/companion"
import { recentMessages, saveMessage } from "@/lib/server/history"
import { coreMemories, extractAndStore, recall } from "@/lib/server/memory"
import { maybeTidy } from "@/lib/server/tidy"
import { getSession, ipHash, unauthorized } from "@/lib/server/session"
import { checkChatAllowed, estimateCost, limitResponse, recordUsage } from "@/lib/server/usage"

export const maxDuration = 60

const HISTORY_TURNS = 20

// Keeps each reply, and so each request's cost, bounded for the public demo.
const MAX_REPLY_TOKENS = 1024

const RequestSchema = z.object({
  message: z.string().trim().min(1).max(2000),
  mode: z.enum(["text", "voice"]).default("text"),
  timeZone: z.string().max(64).optional(),
})

export type ChatEvent =
  | { type: "recalled"; memories: { id: string; content: string; similarity: number }[] }
  | { type: "text"; text: string }
  | { type: "remembered"; memories: { id: string; content: string }[] }
  | { type: "error"; error: string }
  | { type: "done" }

export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { userId, name: userName } = session

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: "Messages can be up to 2,000 characters." }, { status: 400 })
  }
  const { message, mode, timeZone } = parsed.data

  const ip = ipHash(req)
  const check = await checkChatAllowed(userId, ip)
  if (!check.ok) return limitResponse(check)

  // After the reply has streamed: merge, update and retire memories now and then.
  after(() => maybeTidy(userId, ip).catch((error) => console.error("Memory tidy-up failed", error)))

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ChatEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      // Every attempt counts towards the rate limits, priced at whatever it cost.
      let costUsd = 0

      try {
        const [history, core, memories] = await Promise.all([
          recentMessages(userId, HISTORY_TURNS),
          coreMemories(userId),
          recall(userId, message),
        ])
        await saveMessage(userId, "user", message)
        send({
          type: "recalled",
          memories: memories.map(({ id, content, similarity }) => ({ id, content, similarity })),
        })

        const systemNote = replyNote(describeMemories(userName, core, memories), describeNow(timeZone), mode)

        const messages: Anthropic.Beta.BetaMessageParam[] = [
          ...historyForClaude(history),
          { role: "user", content: message },
          // Mid-conversation system message: keeps the top-level system prompt
          // stable and marks recalled memories as operator context, not user text.
          { role: "system", content: systemNote },
        ]

        const response = anthropic().beta.messages.stream({
          model: CHAT_MODEL,
          max_tokens: MAX_REPLY_TOKENS,
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
        costUsd += estimateCost(final.model, final.usage)
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
          const { stored, costUsd: extractionCost } = await extractAndStore(userId, message, reply, [...core, ...memories], saved.id)
          costUsd += extractionCost
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
        await recordUsage("chat", userId, ip, costUsd).catch((error) => console.error("Recording usage failed", error))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  })
}
