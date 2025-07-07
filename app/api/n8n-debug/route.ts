import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const { testMessage = "Debug test message" } = await req.json()

    const webhookUrl = process.env.N8N_WEBHOOK_URL
    if (!webhookUrl) {
      return NextResponse.json({ error: "N8N_WEBHOOK_URL not configured" }, { status: 500 })
    }

    const debugPayload = {
      sessionId: "debug-session",
      message: testMessage,
      allMessages: [{ role: "user", content: testMessage }],
      timestamp: new Date().toISOString(),
      source: "debug-endpoint",
      requestId: `debug-${Date.now()}`,
      user: { id: "debug", name: "Debug User", email: "debug@cosmic.ai" },
    }

    console.log("=== N8N DEBUG REQUEST ===")
    console.log("URL:", webhookUrl)
    console.log("Payload:", JSON.stringify(debugPayload, null, 2))

    const startTime = Date.now()

    // Make multiple requests to test consistency
    const results = []

    for (let i = 1; i <= 3; i++) {
      console.log(`\n--- Debug Request ${i}/3 ---`)

      try {
        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "User-Agent": `EternalMemoriesAI-Debug/1.0-${i}`,
            "X-Debug-Request": `${i}`,
          },
          body: JSON.stringify({ ...debugPayload, requestId: `debug-${Date.now()}-${i}` }),
          signal: AbortSignal.timeout(30000),
        })

        const responseText = await response.text()
        const requestTime = Date.now() - startTime

        console.log(`Request ${i} - Status: ${response.status}`)
        console.log(`Request ${i} - Time: ${requestTime}ms`)
        console.log(`Request ${i} - Response length: ${responseText.length}`)
        console.log(`Request ${i} - Response: ${responseText}`)

        let parsedResponse = null
        let parseError = null

        try {
          if (responseText.trim()) {
            parsedResponse = JSON.parse(responseText)
          }
        } catch (error) {
          parseError = error instanceof Error ? error.message : "Parse error"
        }

        results.push({
          requestNumber: i,
          success: response.ok,
          status: response.status,
          statusText: response.statusText,
          responseTime: `${requestTime}ms`,
          headers: Object.fromEntries(response.headers.entries()),
          rawResponse: responseText,
          responseLength: responseText.length,
          isEmpty: responseText.length === 0,
          isWhitespaceOnly: responseText.trim().length === 0,
          parsedResponse,
          parseError,
          isArray: Array.isArray(parsedResponse),
          hasOutputField:
            parsedResponse &&
            ((Array.isArray(parsedResponse) && parsedResponse[0]?.output !== undefined) ||
              (typeof parsedResponse === "object" && parsedResponse.output !== undefined)),
          extractedContent:
            parsedResponse && Array.isArray(parsedResponse) && parsedResponse[0]?.output
              ? parsedResponse[0].output
              : parsedResponse?.output || parsedResponse?.response || "No content found",
        })

        // Wait between requests
        if (i < 3) {
          await new Promise((resolve) => setTimeout(resolve, 1000))
        }
      } catch (error) {
        console.error(`Request ${i} failed:`, error)
        results.push({
          requestNumber: i,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    return NextResponse.json({
      webhookUrl: webhookUrl.replace(/\/[^/]*$/, "/***"),
      totalRequests: 3,
      results,
      summary: {
        successfulRequests: results.filter((r) => r.success).length,
        emptyResponses: results.filter((r) => r.isEmpty).length,
        parsedSuccessfully: results.filter((r) => r.parsedResponse && !r.parseError).length,
        hasOutputField: results.filter((r) => r.hasOutputField).length,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Debug test failed:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Debug test failed",
        success: false,
      },
      { status: 500 },
    )
  }
}
