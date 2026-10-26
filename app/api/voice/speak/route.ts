import { z } from "zod"
import { plainSpeech, streamSpeech } from "@/lib/server/elevenlabs"
import { getSession, ipHash, unauthorized } from "@/lib/server/session"
import { checkSpendAllowed, limitResponse, recordUsage, speechCost } from "@/lib/server/usage"

// The client sends one sentence or short group of sentences at a time.
const RequestSchema = z.object({ text: z.string().trim().min(1).max(600) })

/** Speaks a piece of the companion's reply. Every character is costed against the visitor's budget. */
export async function POST(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const parsed = RequestSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: "Text must be 1-600 characters." }, { status: 400 })

  const text = plainSpeech(parsed.data.text)
  if (!text) return new Response(null, { status: 204 })

  const ip = ipHash(req)
  const check = await checkSpendAllowed(session.userId, ip)
  if (!check.ok) return limitResponse(check)

  try {
    const audio = await streamSpeech(text)
    await recordUsage("tts", session.userId, ip, speechCost(text.length))
    return new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("Speech synthesis failed", error)
    return Response.json({ error: "Couldn't speak that reply." }, { status: 502 })
  }
}
