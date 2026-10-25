import { forgetMemory } from "@/lib/server/memory"

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = new URL(req.url).searchParams.get("userId")
  if (!userId) return Response.json({ error: "userId is required" }, { status: 400 })

  try {
    const deleted = await forgetMemory(userId, id)
    return deleted ? new Response(null, { status: 204 }) : Response.json({ error: "Not found" }, { status: 404 })
  } catch (error) {
    console.error("Forgetting memory failed", error)
    return Response.json({ error: "Could not forget that memory" }, { status: 500 })
  }
}
