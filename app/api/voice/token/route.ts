import { createListeningToken, LISTENING_MODEL } from "@/lib/server/elevenlabs"
import { getSession, ipHash, unauthorized } from "@/lib/server/session"
import { checkChatAllowed, limitResponse, listeningCost, recordUsage, VOICE_SESSION_MINUTES } from "@/lib/server/usage"

/**
 * Mints a single-use token for one Scribe realtime listening session. Each token
 * is charged up front as VOICE_SESSION_MINUTES of listening; the client asks
 * for a new one when that time is up.
 */
export async function GET(req: Request) {
  const session = await getSession()
  if (!session) return unauthorized()

  const ip = ipHash(req)
  const check = await checkChatAllowed(session.userId, ip)
  if (!check.ok) return limitResponse(check)

  try {
    const token = await createListeningToken()
    await recordUsage("stt", session.userId, ip, listeningCost(VOICE_SESSION_MINUTES))
    return Response.json(
      { token, modelId: LISTENING_MODEL, validForSeconds: VOICE_SESSION_MINUTES * 60 },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("Creating a listening token failed", error)
    return Response.json({ error: "Voice is unavailable right now. You can keep typing." }, { status: 502 })
  }
}
