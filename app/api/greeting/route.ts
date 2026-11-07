import { z } from "zod"
import { anthropic, CHAT_MODEL } from "@/lib/server/anthropic"
import { describeMemories, greetingNote, historyForClaude, OPENING_TURN, plainGreeting, SYSTEM_PROMPT } from "@/lib/server/companion"
import { recentMessages, saveMessage } from "@/lib/server/history"
import { coreMemories, newestMemories } from "@/lib/server/memory"
import { getSession, ipHash, unauthorized } from "@/lib/server/session"
import { checkChatAllowed, estimateCost, recordUsage } from "@/lib/server/usage"

export const maxDuration = 60

// A person coming back within this time is carrying on, not starting a new visit.
const NEW_VISIT_AFTER_MS = 3 * 60 * 60 * 1000
const HISTORY_TURNS = 20
const NEWEST_MEMORIES = 10
// Generous for a few sentences: the model's reasoning counts towards this too, and a
// tighter limit occasionally cut greetings off mid-sentence.
const MAX_GREETING_TOKENS = 1024

const RequestSchema = z.object({ timeZone: z.string().max(64).optional() })

/**
 * The companion speaks first on a new visit: hello by name, then a question that
 * follows up on last time. Returns { greeting: null } when no greeting is due, and
 * a plain, free hello in { fallback } when the limits don't allow a generated one.
 */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()
  const { userId, name } = session
  const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})))
  const timeZone = parsed.success ? parsed.data.timeZone : undefined

  const history = await recentMessages(userId, HISTORY_TURNS)
  const last = history.at(-1)
  const lastTalked = last ? new Date(last.created_at) : null
  if (lastTalked && Date.now() - lastTalked.getTime() < NEW_VISIT_AFTER_MS) return Response.json({ greeting: null })

  const ip = ipHash(req)
  const check = await checkChatAllowed(userId, ip)
  if (!check.ok) return Response.json({ greeting: null, fallback: plainGreeting(name) })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: { type: "text"; text: string } | { type: "done" }) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      let costUsd = 0
      let sentText = false

      try {
        const [core, newest] = await Promise.all([coreMemories(userId), newestMemories(userId, NEWEST_MEMORIES)])
        const memories = describeMemories(name, core, newest, "Other recent things you remember")
        const response = anthropic().beta.messages.stream(
          {
            model: CHAT_MODEL,
            max_tokens: MAX_GREETING_TOKENS,
            output_config: { effort: "low" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system: SYSTEM_PROMPT,
            messages: [
              ...historyForClaude(history),
              OPENING_TURN,
              { role: "system", content: greetingNote(memories, timeZone, lastTalked) },
            ],
          },
          { signal: req.signal },
        )

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            sentText = true
            send({ type: "text", text: event.delta.text })
          }
        }

        const final = await response.finalMessage()
        costUsd += estimateCost(final.model, final.usage)
        const greeting = final.content
          .flatMap((block) => (block.type === "text" ? [block.text] : []))
          .join("")
          .trim()
        if (final.stop_reason !== "end_turn") console.warn("Greeting stopped early", final.stop_reason, final.model)
        if (final.stop_reason === "refusal" || !greeting) throw new Error("No greeting from model")
        // If they started typing first, the browser cancelled this: don't save it after their message.
        if (!req.signal.aborted) await saveMessage(userId, "assistant", greeting)
        send({ type: "done" })
      } catch (error) {
        if (!req.signal.aborted) {
          console.error("Greeting failed", error)
          // Not saved: a plain hello shouldn't count as part of the conversation.
          if (!sentText) send({ type: "text", text: plainGreeting(name) })
          send({ type: "done" })
        }
      } finally {
        await recordUsage("chat", userId, ip, costUsd).catch((error) => console.error("Recording usage failed", error))
        try {
          controller.close()
        } catch {
          // Already closed because the browser went away.
        }
      }
    },
  })

  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } })
}
