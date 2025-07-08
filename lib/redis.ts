import { Redis } from "@upstash/redis"

// Initialize Redis client
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Helper functions for your app
export async function setUser(email: string, user: any) {
  const key = `user:${email.toLowerCase().trim()}`
  return await redis.set(key, user)
}

export async function getUser(email: string) {
  const key = `user:${email.toLowerCase().trim()}`
  return await redis.get(key)
}

export async function setSession(sessionId: string, data: any) {
  const key = `session:${sessionId}`
  return await redis.set(key, data)
}

export async function getSession(sessionId: string) {
  const key = `session:${sessionId}`
  return await redis.get(key)
}

export async function setMessages(sessionId: string, messages: any[]) {
  const key = `messages:${sessionId}`
  return await redis.set(key, messages)
}

export async function getMessages(sessionId: string) {
  const key = `messages:${sessionId}`
  return (await redis.get(key)) || []
}
