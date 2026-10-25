import "server-only"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example and docs/SETUP.md.`)
  return value
}

export const env = {
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY")
  },
  get supabaseUrl() {
    return required("SUPABASE_URL")
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY")
  },
  get embedFunctionSecret() {
    return required("EMBED_FUNCTION_SECRET")
  },
  get elevenLabsApiKey() {
    return required("ELEVENLABS_API_KEY")
  },
  get elevenLabsVoiceId() {
    return required("ELEVENLABS_VOICE_ID")
  },
  get sessionSecret() {
    const value = required("SESSION_SECRET")
    if (value.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters")
    return value
  },
}

function numberFrom(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Demo safety limits. Override any of them with the matching env var. */
export const limits = {
  /** Total estimated Claude spend across all visitors in any rolling 24 hours. */
  dailyBudgetUsd: numberFrom("DEMO_DAILY_BUDGET_USD", 2),
  /** One visitor's estimated spend (chat + voice) in any rolling 24 hours. */
  userDailyBudgetUsd: numberFrom("DEMO_USER_DAILY_BUDGET_USD", 0.3),
  userChatsPerMinute: numberFrom("DEMO_USER_CHATS_PER_MINUTE", 5),
  userChatsPerDay: numberFrom("DEMO_USER_CHATS_PER_DAY", 40),
  ipChatsPerDay: numberFrom("DEMO_IP_CHATS_PER_DAY", 100),
  ipSessionsPerDay: numberFrom("DEMO_IP_SESSIONS_PER_DAY", 5),
}
