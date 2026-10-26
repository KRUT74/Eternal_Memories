import { listMemories } from "@/lib/server/memory"
import { getSession, unauthorized } from "@/lib/server/session"

export async function GET() {
  const session = await getSession()
  if (!session) return unauthorized()

  try {
    return Response.json({ memories: await listMemories(session.userId) })
  } catch (error) {
    console.error("Loading memories failed", error)
    return Response.json({ error: "Could not load memories" }, { status: 500 })
  }
}
