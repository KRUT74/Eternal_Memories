import { listMemories } from "@/lib/server/memory"
import { getSession, unauthorized } from "@/lib/server/session"
import { lastTidy } from "@/lib/server/tidy"

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    const [memories, tidy] = await Promise.all([listMemories(session.userId), lastTidy(session.userId)])
    return Response.json({ memories, lastTidy: tidy })
  } catch (error) {
    console.error("Loading memories failed", error)
    return Response.json({ error: "Could not load memories" }, { status: 500 })
  }
}
