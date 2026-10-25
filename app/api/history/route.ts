import { recentMessages } from "@/lib/server/history"

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId")
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 })

  try {
    const messages = await recentMessages(userId, 100)
    return Response.json({ messages: messages.map(({ id, role, content }) => ({ id, role, content })) })
  } catch (error) {
    console.error("Loading history failed", error)
    return Response.json({ error: "Could not load your conversation" }, { status: 500 })
  }
}
