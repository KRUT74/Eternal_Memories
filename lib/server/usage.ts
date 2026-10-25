import "server-only"
import type Anthropic from "@anthropic-ai/sdk"
import { limits } from "./env"
import { supabase } from "./supabase"

// USD per million tokens (input, output). Unknown models - for example a
// server-side fallback - are priced at the most expensive tier so the budget
// errs on the safe side.
const PRICES: Record<string, [number, number]> = {
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
}
const MOST_EXPENSIVE: [number, number] = [10, 50]

// ElevenLabs API rates: Flash v2.5 text-to-speech and Scribe v2 Realtime.
const TTS_USD_PER_1K_CHARS = 0.05
const STT_USD_PER_HOUR = 0.39
/** Each voice token is charged as this many minutes of listening, up front. */
export const VOICE_SESSION_MINUTES = 5

export const speechCost = (characters: number) => (characters / 1000) * TTS_USD_PER_1K_CHARS
export const listeningCost = (minutes: number) => (minutes / 60) * STT_USD_PER_HOUR

type Usage = Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> & {
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export function estimateCost(model: string, usage: Usage): number {
  const [inputPrice, outputPrice] = PRICES[model] ?? MOST_EXPENSIVE
  const input =
    usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1
  return (input * inputPrice + usage.output_tokens * outputPrice) / 1_000_000
}

interface UsageSummary {
  user_chats_last_minute: number
  user_chats_last_day: number
  ip_chats_last_day: number
  ip_sessions_last_day: number
  total_cost_last_day: number
  user_cost_last_day: number
}

async function summary(userId: string | null, ipHash: string): Promise<UsageSummary> {
  const { data, error } = await supabase().rpc("usage_summary", { p_user_id: userId ?? "", p_ip_hash: ipHash })
  if (error) throw error
  const row = (data as UsageSummary[])[0]
  return {
    ...row,
    total_cost_last_day: Number(row.total_cost_last_day),
    user_cost_last_day: Number(row.user_cost_last_day),
  }
}

export type LimitCheck = { ok: true; remainingToday: number } | { ok: false; error: string; retryAfterSeconds: number }

const DAY = 24 * 60 * 60

function spendExceeded(s: UsageSummary): Extract<LimitCheck, { ok: false }> | null {
  if (s.total_cost_last_day >= limits.dailyBudgetUsd) {
    return {
      ok: false,
      error: "The demo has reached its daily limit. Please come back tomorrow - your memories will still be here.",
      retryAfterSeconds: DAY,
    }
  }
  if (s.user_cost_last_day >= limits.userDailyBudgetUsd) {
    return {
      ok: false,
      error: "You've reached today's limit for this demo. Please come back tomorrow - I'll still remember you.",
      retryAfterSeconds: DAY,
    }
  }
  return null
}

/** Voice calls (listening tokens, speech) are bounded by spend, not message counts. */
export async function checkSpendAllowed(userId: string, ipHash: string): Promise<LimitCheck> {
  const s = await summary(userId, ipHash)
  return spendExceeded(s) ?? { ok: true, remainingToday: remaining(s) }
}

export async function checkChatAllowed(userId: string, ipHash: string): Promise<LimitCheck> {
  const s = await summary(userId, ipHash)
  const overSpend = spendExceeded(s)
  if (overSpend) return overSpend
  if (s.user_chats_last_minute >= limits.userChatsPerMinute) {
    return { ok: false, error: "You're sending messages quickly. Please wait a moment and try again.", retryAfterSeconds: 60 }
  }
  if (s.user_chats_last_day >= limits.userChatsPerDay || s.ip_chats_last_day >= limits.ipChatsPerDay) {
    return {
      ok: false,
      error: "You've reached today's message limit for this demo. Please come back tomorrow.",
      retryAfterSeconds: DAY,
    }
  }
  return { ok: true, remainingToday: remaining(s) }
}

export async function remainingToday(userId: string, ipHash: string): Promise<number> {
  const s = await summary(userId, ipHash)
  return spendExceeded(s) ? 0 : remaining(s)
}

function remaining(s: UsageSummary): number {
  return Math.max(0, Math.min(limits.userChatsPerDay - s.user_chats_last_day, limits.ipChatsPerDay - s.ip_chats_last_day))
}

export async function checkSessionAllowed(ipHash: string): Promise<LimitCheck> {
  const s = await summary(null, ipHash)
  if (s.ip_sessions_last_day >= limits.ipSessionsPerDay) {
    return { ok: false, error: "Too many new sessions from your network today. Please try again tomorrow.", retryAfterSeconds: DAY }
  }
  return { ok: true, remainingToday: 0 }
}

export async function recordUsage(
  kind: "chat" | "session" | "stt" | "tts",
  userId: string,
  ipHash: string,
  costUsd = 0,
) {
  const { error } = await supabase()
    .from("usage_events")
    .insert({ kind, user_id: userId, ip_hash: ipHash, cost_usd: costUsd })
  if (error) throw error
}

export function limitResponse(check: Extract<LimitCheck, { ok: false }>) {
  return Response.json(
    { error: check.error },
    { status: 429, headers: { "Retry-After": String(check.retryAfterSeconds) } },
  )
}
