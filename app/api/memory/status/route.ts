import { NextResponse } from "next/server"

export async function GET() {
  try {
    // Check if the webhook URL is configured
    const webhookUrl = process.env.N8N_WEBHOOK_URL

    if (!webhookUrl) {
      return NextResponse.json({ status: "error", message: "N8N_WEBHOOK_URL is not configured" }, { status: 500 })
    }

    // In a real application, you might want to ping the webhook endpoint
    // to check if it's actually available

    // For now, we'll just return a success response with mock data
    return NextResponse.json({
      status: "ok",
      messagesStored: Math.floor(Math.random() * 100), // Mock data
      lastUpdated: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error checking memory status:", error)
    return NextResponse.json({ status: "error", message: "Failed to check memory status" }, { status: 500 })
  }
}
