import { NextResponse } from "next/server"

// In-memory storage for webhook status (in production, use a database)
const webhookStatus: Record<
  string,
  {
    status: "pending" | "processing" | "completed" | "failed"
    error?: string
    timestamp: number
  }
> = {}

// Clean up old status entries periodically
const CLEANUP_INTERVAL = 1000 * 60 * 60 // 1 hour
const STATUS_TTL = 1000 * 60 * 30 // 30 minutes

// Cleanup function
function cleanupOldStatus() {
  const now = Date.now()
  Object.keys(webhookStatus).forEach((requestId) => {
    if (now - webhookStatus[requestId].timestamp > STATUS_TTL) {
      delete webhookStatus[requestId]
    }
  })
}

// Set up cleanup interval
if (typeof setInterval !== "undefined") {
  setInterval(cleanupOldStatus, CLEANUP_INTERVAL)
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const requestId = url.searchParams.get("requestId")

    if (!requestId) {
      return NextResponse.json({ error: "Request ID is required" }, { status: 400 })
    }

    const status = webhookStatus[requestId]

    if (!status) {
      return NextResponse.json({ status: "unknown", message: "No status found for this request ID" }, { status: 404 })
    }

    return NextResponse.json({
      status: status.status,
      error: status.error,
      timestamp: status.timestamp,
    })
  } catch (error) {
    console.error("Error getting webhook status:", error)
    return NextResponse.json({ error: "Failed to get webhook status" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.text()

    if (!body) {
      return NextResponse.json({ error: "Request body is required" }, { status: 400 })
    }

    let requestData
    try {
      requestData = JSON.parse(body)
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError)
      return NextResponse.json({ error: "Invalid JSON in request body" }, { status: 400 })
    }

    const { requestId, status, error } = requestData

    if (!requestId || !status) {
      return NextResponse.json({ error: "Request ID and status are required" }, { status: 400 })
    }

    webhookStatus[requestId] = {
      status,
      error,
      timestamp: Date.now(),
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating webhook status:", error)
    return NextResponse.json({ error: "Failed to update webhook status" }, { status: 500 })
  }
}
