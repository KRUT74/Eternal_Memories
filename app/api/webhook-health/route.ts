import { NextResponse } from "next/server"

export async function GET() {
  try {
    const webhookUrl = process.env.N8N_WEBHOOK_URL

    if (!webhookUrl) {
      return NextResponse.json(
        {
          status: "error",
          message: "N8N_WEBHOOK_URL not configured",
          timestamp: new Date().toISOString(),
        },
        { status: 500 },
      )
    }

    // SIMPLIFIED: Just check if URL is configured, don't actually ping n8n
    // This prevents automatic health check spam to your n8n workflow
    return NextResponse.json({
      status: "configured",
      message: "n8n webhook URL is configured (manual test available)",
      webhookConfigured: true,
      timestamp: new Date().toISOString(),
      note: "Automatic health checks disabled to reduce n8n workflow noise",
    })
  } catch (error) {
    console.error("n8n webhook health check failed:", error)

    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Health check failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
