import { listMemories } from "@/lib/server/memory"

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId")
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 })

  try {
    return Response.json({ memories: await listMemories(userId) })
  } catch (error) {
    console.error("Loading memories failed", error)
    return Response.json({ error: "Could not load memories" }, { status: 500 })
  }
}
