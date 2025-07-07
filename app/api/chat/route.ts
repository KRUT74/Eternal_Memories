import { NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

// Allow streaming responses up to 5 minutes
export const maxDuration = 300

export async function POST(req: Request) {
  try {
    const { messages, sessionId, requestId = uuidv4(), user } = await req.json()

    // Create a new TransformStream to stream the response
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()

    // Send the request to the webhook and stream the response
    sendToWebhookAndStreamResponse(messages, sessionId, requestId, req, writer, user).catch((error) => {
      console.error("Error in webhook communication:", error)
      // Make sure to handle writer errors properly
      try {
        writer.write(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: "Webhook communication failed. Please try again." })}\n\n`,
          ),
        )
        writer.write(encoder.encode(`data: [DONE]\n\n`))
        writer.close()
      } catch (writerError) {
        console.error("Error writing to stream:", writerError)
      }
    })

    // Return the response with the request ID header
    return new NextResponse(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "x-request-id": requestId,
      },
    })
  } catch (error) {
    console.error("Error in chat API:", error)
    return NextResponse.json({ error: "Failed to process chat request" }, { status: 500 })
  }
}

const encoder = new TextEncoder()

// Enhanced webhook status update with retry logic
async function updateWebhookStatus(baseUrl: string, requestId: string, status: string, error?: string, retries = 2) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/api/webhook-status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId,
          status,
          error,
          timestamp: Date.now(),
        }),
        signal: AbortSignal.timeout(3000), // 3 second timeout
      })

      if (response.ok) {
        return // Success
      }
    } catch (err) {
      if (attempt === retries) {
        console.error("Failed to update webhook status after all retries")
      }
    }
  }
}

// Enhanced webhook request handling with graceful empty response handling
async function sendToWebhookAndStreamResponse(
  messages: any[],
  sessionId: string,
  requestId: string,
  req: Request,
  writer: WritableStreamDefaultWriter,
  user?: { id: string; name: string; email: string },
) {
  const baseUrl = new URL(req.url).origin

  try {
    // Update status to pending
    await updateWebhookStatus(baseUrl, requestId, "pending")

    // Write initial status to the stream
    writer.write(
      encoder.encode(
        `data: ${JSON.stringify({ type: "status", status: "pending", message: "Connecting to cosmic memory..." })}\n\n`,
      ),
    )

    // Validate webhook URL
    const webhookUrl = process.env.N8N_WEBHOOK_URL
    if (!webhookUrl) {
      throw new Error("N8N_WEBHOOK_URL environment variable is not configured")
    }

    console.log(`[${requestId}] ========== N8N WEBHOOK REQUEST START ==========`)
    console.log(`[${requestId}] Webhook URL: ${webhookUrl}`)
    console.log(`[${requestId}] Timestamp: ${new Date().toISOString()}`)

    const lastMessage = messages[messages.length - 1]

    // Prepare the payload for your n8n workflow
    const payload = {
      sessionId,
      message: typeof lastMessage.content === "string" ? lastMessage.content : JSON.stringify(lastMessage.content),
      allMessages: messages,
      timestamp: new Date().toISOString(),
      source: "chat-app",
      requestId,
      user: user || { id: "anonymous", name: "Anonymous", email: "anonymous@cosmic.ai" },
    }

    console.log(`[${requestId}] Payload being sent:`)
    console.log(`[${requestId}] ${JSON.stringify(payload, null, 2)}`)

    // Update status to processing
    writer.write(
      encoder.encode(
        `data: ${JSON.stringify({ type: "status", status: "processing", message: "Sending to n8n workflow..." })}\n\n`,
      ),
    )

    // Make the webhook request with detailed logging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
      console.log(`[${requestId}] ❌ REQUEST TIMEOUT after 60 seconds`)
    }, 60000) // 60 second timeout

    console.log(`[${requestId}] 🚀 Making HTTP request to n8n...`)
    const requestStartTime = Date.now()

    let response: Response
    try {
      response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "EternalMemoriesAI/1.0",
          "X-Request-ID": requestId,
          "X-Session-ID": sessionId,
          Accept: "application/json",
          "Cache-Control": "no-cache",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })
    } catch (fetchError) {
      clearTimeout(timeoutId)
      console.error(`[${requestId}] ❌ FETCH ERROR:`, fetchError)
      throw new Error(`Failed to connect to n8n: ${fetchError instanceof Error ? fetchError.message : "Unknown error"}`)
    }

    clearTimeout(timeoutId)
    const requestDuration = Date.now() - requestStartTime

    console.log(`[${requestId}] ========== N8N RESPONSE RECEIVED ==========`)
    console.log(`[${requestId}] Response time: ${requestDuration}ms`)
    console.log(`[${requestId}] Status: ${response.status} ${response.statusText}`)
    console.log(`[${requestId}] Headers:`)
    response.headers.forEach((value, key) => {
      console.log(`[${requestId}]   ${key}: ${value}`)
    })

    // Check if the response is successful
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[${requestId}] ❌ HTTP ERROR RESPONSE:`)
      console.error(`[${requestId}] Status: ${response.status} ${response.statusText}`)
      console.error(`[${requestId}] Body: ${errorText}`)
      throw new Error(`n8n HTTP error ${response.status}: ${errorText || response.statusText}`)
    }

    // Get the response with detailed logging
    console.log(`[${requestId}] 📥 Reading response body...`)
    let responseText: string
    try {
      responseText = await response.text()
    } catch (readError) {
      console.error(`[${requestId}] ❌ ERROR READING RESPONSE:`, readError)
      throw new Error(
        `Failed to read n8n response: ${readError instanceof Error ? readError.message : "Unknown error"}`,
      )
    }

    console.log(`[${requestId}] ========== RESPONSE ANALYSIS ==========`)
    console.log(`[${requestId}] Response length: ${responseText.length} characters`)
    console.log(`[${requestId}] Response type: ${typeof responseText}`)
    console.log(`[${requestId}] Is empty: ${responseText.length === 0}`)
    console.log(`[${requestId}] Is whitespace only: ${responseText.trim().length === 0}`)

    if (responseText.length > 0) {
      console.log(`[${requestId}] Raw response (first 500 chars):`)
      console.log(`[${requestId}] "${responseText.substring(0, 500)}"`)

      if (responseText.length > 500) {
        console.log(`[${requestId}] Raw response (last 100 chars):`)
        console.log(`[${requestId}] "...${responseText.substring(responseText.length - 100)}"`)
      }

      // Check for common issues
      if (responseText.includes("<!DOCTYPE html>") || responseText.includes("<html")) {
        console.error(`[${requestId}] ❌ RESPONSE IS HTML, NOT JSON`)
        throw new Error("n8n returned HTML instead of JSON - check your workflow's response node")
      }

      if (responseText.includes("error") || responseText.includes("Error")) {
        console.warn(`[${requestId}] ⚠️ Response contains error text`)
      }
    } else {
      console.error(`[${requestId}] ❌ COMPLETELY EMPTY RESPONSE - PROVIDING FALLBACK`)
      console.error(`[${requestId}] This indicates n8n workflow execution issues`)

      // Instead of throwing an error, provide a helpful fallback response
      const fallbackMessage = `🌌 I received your message: "${payload.message}"

However, there seems to be a cosmic interference in the memory system. This usually happens when:

• The n8n workflow executed but didn't return data
• The AI Agent node failed silently
• There's a configuration issue with the response node
• Memory system conflicts between Zep and Simple Memory

**Troubleshooting Steps:**
1. Check your n8n execution logs for errors
2. Verify the "Respond to Webhook" node is properly connected
3. Test the workflow manually in n8n
4. Check if the AI Agent node has proper error handling

Your message has been logged, but the AI response was lost in the cosmic void. Please try again or check your n8n workflow configuration.`

      console.log(`[${requestId}] 📝 Sending fallback response to user`)

      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "message",
            id: requestId,
            role: "assistant",
            content: fallbackMessage,
          })}\n\n`,
        ),
      )

      writer.write(encoder.encode(`data: [DONE]\n\n`))
      writer.close()

      await updateWebhookStatus(
        baseUrl,
        requestId,
        "completed_with_fallback",
        "Empty response from n8n - fallback provided",
      )
      console.log(`[${requestId}] ✅ Fallback response sent successfully`)
      return true
    }

    // Parse the JSON response
    let webhookResponse: any = {}
    try {
      console.log(`[${requestId}] 🔍 Parsing JSON...`)
      webhookResponse = JSON.parse(responseText)
      console.log(`[${requestId}] ✅ JSON parsed successfully`)
      console.log(`[${requestId}] Parsed structure:`, JSON.stringify(webhookResponse, null, 2))
    } catch (parseError) {
      console.error(`[${requestId}] ❌ JSON PARSE ERROR:`, parseError)
      console.error(`[${requestId}] Raw response that failed to parse:`)
      console.error(`[${requestId}] "${responseText}"`)

      // Provide fallback for parse errors too
      const parseErrorFallback = `🌌 I received your message, but the response format was corrupted during cosmic transmission.

**Technical Details:**
- Response received but couldn't be parsed as JSON
- Raw response length: ${responseText.length} characters
- Parse error: ${parseError instanceof Error ? parseError.message : "Unknown"}

**Your message:** "${payload.message}"

Please check your n8n workflow's "Respond to Webhook" node configuration. It should return valid JSON format.`

      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "message",
            id: requestId,
            role: "assistant",
            content: parseErrorFallback,
          })}\n\n`,
        ),
      )

      writer.write(encoder.encode(`data: [DONE]\n\n`))
      writer.close()

      await updateWebhookStatus(baseUrl, requestId, "completed_with_fallback", "JSON parse error - fallback provided")
      return true
    }

    // Extract content using your format: { "response": "content" }
    let responseContent = ""

    console.log(`[${requestId}] 🔍 Extracting content...`)
    console.log(`[${requestId}] Response is array: ${Array.isArray(webhookResponse)}`)
    console.log(`[${requestId}] Response type: ${typeof webhookResponse}`)

    if (Array.isArray(webhookResponse)) {
      console.log(`[${requestId}] Processing array with ${webhookResponse.length} items`)

      if (webhookResponse.length === 0) {
        console.error(`[${requestId}] ❌ Array is empty`)

        const emptyArrayFallback = `🌌 The cosmic memory responded, but the message array was empty.

**Your message:** "${payload.message}"

This suggests your n8n workflow is running but not populating the response array properly. Check your workflow's data flow and response node configuration.`

        writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "message",
              id: requestId,
              role: "assistant",
              content: emptyArrayFallback,
            })}\n\n`,
          ),
        )

        writer.write(encoder.encode(`data: [DONE]\n\n`))
        writer.close()

        await updateWebhookStatus(
          baseUrl,
          requestId,
          "completed_with_fallback",
          "Empty array response - fallback provided",
        )
        return true
      }

      const firstItem = webhookResponse[0]
      console.log(`[${requestId}] First item:`, JSON.stringify(firstItem, null, 2))

      if (firstItem && typeof firstItem === "object") {
        // Check for your format first: { "response": "content" }
        if (firstItem.response !== undefined) {
          responseContent = String(firstItem.response)
          console.log(`[${requestId}] ✅ Found 'response' field: "${responseContent.substring(0, 100)}..."`)
        }
        // Then check for alternative format: { "output": "content" }
        else if (firstItem.output !== undefined) {
          responseContent = String(firstItem.output)
          console.log(`[${requestId}] ✅ Found 'output' field: "${responseContent.substring(0, 100)}..."`)
        } else {
          const availableFields = Object.keys(firstItem)
          console.error(`[${requestId}] ❌ No 'response' or 'output' field found`)
          console.error(`[${requestId}] Available fields: ${availableFields.join(", ")}`)

          const missingFieldFallback = `🌌 The cosmic memory responded, but the expected data fields were missing.

**Your message:** "${payload.message}"

**Available fields in response:** ${availableFields.join(", ")}

Please check your n8n workflow's response format. Expected: { "response": "content" } or { "output": "content" }`

          writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "message",
                id: requestId,
                role: "assistant",
                content: missingFieldFallback,
              })}\n\n`,
            ),
          )

          writer.write(encoder.encode(`data: [DONE]\n\n`))
          writer.close()

          await updateWebhookStatus(
            baseUrl,
            requestId,
            "completed_with_fallback",
            "Missing expected fields - fallback provided",
          )
          return true
        }
      } else {
        console.error(`[${requestId}] ❌ First array item is not an object:`, firstItem)

        const invalidItemFallback = `🌌 The cosmic memory responded, but the data structure was unexpected.

**Your message:** "${payload.message}"

**Received:** ${typeof firstItem} instead of object

Please check your n8n workflow's response structure.`

        writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "message",
              id: requestId,
              role: "assistant",
              content: invalidItemFallback,
            })}\n\n`,
          ),
        )

        writer.write(encoder.encode(`data: [DONE]\n\n`))
        writer.close()

        await updateWebhookStatus(
          baseUrl,
          requestId,
          "completed_with_fallback",
          "Invalid item structure - fallback provided",
        )
        return true
      }
    } else if (typeof webhookResponse === "object" && webhookResponse !== null) {
      console.log(`[${requestId}] Processing object response`)
      const availableFields = Object.keys(webhookResponse)
      console.log(`[${requestId}] Available fields: ${availableFields.join(", ")}`)

      // Check for your format first: { "response": "content" }
      if (webhookResponse.response !== undefined) {
        responseContent = String(webhookResponse.response)
        console.log(`[${requestId}] ✅ Found 'response' field: "${responseContent.substring(0, 100)}..."`)
      }
      // Then check for alternative format: { "output": "content" }
      else if (webhookResponse.output !== undefined) {
        responseContent = String(webhookResponse.output)
        console.log(`[${requestId}] ✅ Found 'output' field: "${responseContent.substring(0, 100)}..."`)
      } else {
        console.error(`[${requestId}] ❌ No 'response' or 'output' field found`)

        const missingFieldObjectFallback = `🌌 The cosmic memory responded, but the expected data fields were missing.

**Your message:** "${payload.message}"

**Available fields in response:** ${availableFields.join(", ")}

Please check your n8n workflow's response format. Expected: { "response": "content" } or { "output": "content" }`

        writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              type: "message",
              id: requestId,
              role: "assistant",
              content: missingFieldObjectFallback,
            })}\n\n`,
          ),
        )

        writer.write(encoder.encode(`data: [DONE]\n\n`))
        writer.close()

        await updateWebhookStatus(
          baseUrl,
          requestId,
          "completed_with_fallback",
          "Missing expected fields in object - fallback provided",
        )
        return true
      }
    } else {
      console.error(`[${requestId}] ❌ Unexpected response type: ${typeof webhookResponse}`)

      const unexpectedTypeFallback = `🌌 The cosmic memory responded with an unexpected data type.

**Your message:** "${payload.message}"

**Received type:** ${typeof webhookResponse}

Please check your n8n workflow's response format.`

      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "message",
            id: requestId,
            role: "assistant",
            content: unexpectedTypeFallback,
          })}\n\n`,
        ),
      )

      writer.write(encoder.encode(`data: [DONE]\n\n`))
      writer.close()

      await updateWebhookStatus(
        baseUrl,
        requestId,
        "completed_with_fallback",
        "Unexpected response type - fallback provided",
      )
      return true
    }

    // Validate content
    if (!responseContent || responseContent.trim() === "") {
      console.error(`[${requestId}] ❌ Extracted content is empty`)

      const emptyContentFallback = `🌌 The cosmic memory processed your message, but the response content was empty.

**Your message:** "${payload.message}"

This suggests the AI Agent in your n8n workflow processed the request but didn't generate any output. Check your AI Agent node configuration and OpenAI API status.`

      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "message",
            id: requestId,
            role: "assistant",
            content: emptyContentFallback,
          })}\n\n`,
        ),
      )

      writer.write(encoder.encode(`data: [DONE]\n\n`))
      writer.close()

      await updateWebhookStatus(baseUrl, requestId, "completed_with_fallback", "Empty content - fallback provided")
      return true
    }

    console.log(`[${requestId}] ✅ Successfully extracted content (${responseContent.length} chars)`)
    console.log(`[${requestId}] ========== REQUEST COMPLETED SUCCESSFULLY ==========`)

    // Update status and stream response
    await updateWebhookStatus(baseUrl, requestId, "completed")

    writer.write(
      encoder.encode(
        `data: ${JSON.stringify({
          type: "message",
          id: requestId,
          role: "assistant",
          content: responseContent,
        })}\n\n`,
      ),
    )

    writer.write(encoder.encode(`data: [DONE]\n\n`))
    writer.close()

    return true
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred"
    console.error(`[${requestId}] ========== REQUEST FAILED ==========`)
    console.error(`[${requestId}] Error: ${errorMessage}`)
    console.error(`[${requestId}] Stack:`, error instanceof Error ? error.stack : "No stack trace")

    // Update the webhook request status with the error
    await updateWebhookStatus(baseUrl, requestId, "failed", errorMessage)

    // Write error to the stream
    try {
      writer.write(
        encoder.encode(
          `data: ${JSON.stringify({
            type: "error",
            error: `🌌 Cosmic interference: ${errorMessage}`,
          })}\n\n`,
        ),
      )

      writer.write(encoder.encode(`data: [DONE]\n\n`))
      writer.close()
    } catch (writerError) {
      console.error(`[${requestId}] Error writing error to stream:`, writerError)
    }

    return false
  }
}
