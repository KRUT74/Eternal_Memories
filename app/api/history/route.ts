import { recentMessages } from "@/lib/server/history"
import { getSession, unauthorized } from "@/lib/server/session"

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const messages = await recentMessages(session.userId, 100)
    return Response.json({ messages: messages.map(({ id, role, content }) => ({ id, role, content })) })
  } catch (error) {
    console.error("Loading history failed", error)
    return Response.json({ error: "Could not load your conversation" }, { status: 500 })
  }
}
