import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { env } from "./env"

let client: Anthropic | null = null

export function anthropic(): Anthropic {
  client ??= new Anthropic({ apiKey: env.anthropicApiKey })
  return client
}

/** Writes the replies the user sees. */
export const CHAT_MODEL = "claude-sonnet-5-5"
/** Reads each exchange and decides what is worth remembering. */
export const MEMORY_MODEL = "claude-haiku-5-5"
