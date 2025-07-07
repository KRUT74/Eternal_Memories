import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { testMessage = "Hello from test endpoint" } = await req.json()

    const webhookUrl = process.env.N8N_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: "N8N_WEBHOOK_URL not configured" }, { status: 500 })
    }

    const testPayload = {
      sessionId: "test-session",
      message: testMessage,
      allMessages: [{ role: "user", content: testMessage }],
      timestamp: new Date().toISOString(),
      source: "test-endpoint",
      requestId: `test-${Date.now()}`,
      user: { id: "test", name: "Test User", email: "test@cosmic.ai" },
    }

    console.log("Testing n8n with payload:", JSON.stringify(testPayload, null, 2))

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "EternalMemoriesAI-Test/1.0",
      },
      body: JSON.stringify(testPayload),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    })

    const responseText = await response.text()

    console.log("n8n test response status:", response.status)
    console.log("n8n test response headers:", Object.fromEntries(response.headers.entries()))
    console.log("n8n test response body:", responseText)

    let parsedResponse = null
    let parseError = null
    let extractedContent = ""

    try {
      if (responseText.trim()) {
        parsedResponse = JSON.parse(responseText)

        // Extract content using the same logic as the main handler
        if (Array.isArray(parsedResponse) && parsedResponse.length > 0) {
          const firstItem = parsedResponse[0]
          if (firstItem && typeof firstItem === "object") {
            extractedContent =
              firstItem.output ||
              firstItem.response ||
              firstItem.result ||
              firstItem.data ||
              firstItem.message ||
              firstItem.text ||
              firstItem.content ||
              ""
          }
        } else if (typeof parsedResponse === "object" && parsedResponse !== null) {
          extractedContent =
            parsedResponse.output ||
            parsedResponse.response ||
            parsedResponse.result ||
            parsedResponse.data ||
            parsedResponse.message ||
            parsedResponse.text ||
            parsedResponse.content ||
            ""
        } else if (typeof parsedResponse === "string") {
          extractedContent = parsedResponse
        }
      }
    } catch (error) {
      parseError = error instanceof Error ? error.message : "Unknown parse error"
    }

    return NextResponse.json({
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      rawResponse: responseText,
      parsedResponse,
      parseError,
      isEmpty: !responseText || responseText.trim() === "",
      isArray: Array.isArray(parsedResponse),
      hasOutputField:
        parsedResponse &&
        ((Array.isArray(parsedResponse) && parsedResponse[0]?.output !== undefined) ||
          (typeof parsedResponse === "object" && parsedResponse.output !== undefined)),
      hasResponseField:
        parsedResponse &&
        ((Array.isArray(parsedResponse) && parsedResponse[0]?.response !== undefined) ||
          (typeof parsedResponse === "object" && parsedResponse.response !== undefined)),
      extractedContent,
      responseFormat: Array.isArray(parsedResponse) ? "array" : typeof parsedResponse,
    })
  } catch (error) {
    console.error("n8n test failed:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Test failed",
        success: false,
      },
      { status: 500 },
    )
  }
}
