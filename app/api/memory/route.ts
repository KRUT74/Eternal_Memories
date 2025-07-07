import { NextResponse } from "next/server"

// In-memory storage for memory stats (in production, use a database)
const memoryStats = {
  messagesStored: 0,
  lastUpdated: new Date().toISOString(),
  status: "ok",
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const sessionId = url.searchParams.get("sessionId")

    if (sessionId) {
      // If a session ID is provided, return memory for that session
      return NextResponse.json({
        sessionId,
        messagesStored: memoryStats.messagesStored,
        lastUpdated: memoryStats.lastUpdated,
      })
    }

    // Otherwise return general memory stats
    return NextResponse.json(memoryStats)
  } catch (error) {
    console.error("Error getting memory:", error)
    return NextResponse.json({ error: "Failed to get memory" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { action } = await req.json()

    if (action === "increment") {
      memoryStats.messagesStored += 1
      memoryStats.lastUpdated = new Date().toISOString()
    } else if (action === "reset") {
      memoryStats.messagesStored = 0
      memoryStats.lastUpdated = new Date().toISOString()
    }

    return NextResponse.json(memoryStats)
  } catch (error) {
    console.error("Error updating memory:", error)
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 })
  }
}
