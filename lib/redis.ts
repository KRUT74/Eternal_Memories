import { Redis } from "@upstash/redis"

// Initialize Redis client
export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Helper functions for your app
export async function setUser(email: string, user: any) {
  const key = `user:${email.toLowerCase().trim()}`
  try {
    const result = await redis.set(key, user)
    console.log(`✅ User stored in Redis: ${email}`)
    return result
  } catch (error) {
    console.error(`❌ Failed to store user in Redis: ${email}`, error)
    throw error
  }
}

export async function getUser(email: string) {
  const key = `user:${email.toLowerCase().trim()}`
  try {
    const result = await redis.get(key)
    console.log(`📖 User retrieved from Redis: ${email}`, result ? "✅ Found" : "❌ Not found")
    return result
  } catch (error) {
    console.error(`❌ Failed to get user from Redis: ${email}`, error)
    throw error
  }
}

export async function setSession(sessionId: string, data: any) {
  const key = `session:${sessionId}`
  try {
    const result = await redis.set(key, data)
    console.log(`✅ Session stored in Redis: ${sessionId}`)
    return result
  } catch (error) {
    console.error(`❌ Failed to store session in Redis: ${sessionId}`, error)
    throw error
  }
}

export async function getSession(sessionId: string) {
  const key = `session:${sessionId}`
  try {
    const result = await redis.get(key)
    console.log(`📖 Session retrieved from Redis: ${sessionId}`, result ? "✅ Found" : "❌ Not found")
    return result
  } catch (error) {
    console.error(`❌ Failed to get session from Redis: ${sessionId}`, error)
    throw error
  }
}

export async function setMessages(sessionId: string, messages: any[]) {
  const key = `messages:${sessionId}`
  try {
    const result = await redis.set(key, messages)
    console.log(`✅ Messages stored in Redis: ${sessionId} (${messages.length} messages)`)
    return result
  } catch (error) {
    console.error(`❌ Failed to store messages in Redis: ${sessionId}`, error)
    throw error
  }
}

export async function getMessages(sessionId: string) {
  const key = `messages:${sessionId}`
  try {
    const result = (await redis.get(key)) || []
    console.log(
      `📖 Messages retrieved from Redis: ${sessionId} (${Array.isArray(result) ? result.length : 0} messages)`,
    )
    return result
  } catch (error) {
    console.error(`❌ Failed to get messages from Redis: ${sessionId}`, error)
    throw error
  }
}
