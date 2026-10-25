import "server-only"
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js"
import { env } from "./env"

let client: ElevenLabsClient | null = null

function elevenlabs(): ElevenLabsClient {
  client ??= new ElevenLabsClient({ apiKey: env.elevenLabsApiKey })
  return client
}

/** Lowest-latency ElevenLabs voice model (~75 ms). */
export const SPEECH_MODEL = "eleven_flash_v2_5"
export const LISTENING_MODEL = "scribe_v2_realtime"

/**
 * A single-use token that lets the browser open one Scribe realtime session
 * without ever seeing our API key. Expires after 15 minutes if unused.
 */
export async function createListeningToken(): Promise<string> {
  const { token } = await elevenlabs().tokens.singleUse.create("realtime_scribe")
  return token
}

/** Streams MP3 audio of `text` in the companion's voice. */
export async function streamSpeech(text: string): Promise<ReadableStream<Uint8Array>> {
  return elevenlabs().textToSpeech.stream(env.elevenLabsVoiceId, {
    text,
    modelId: SPEECH_MODEL,
    outputFormat: "mp3_44100_128",
  })
}

/** Removes Markdown so it isn't read aloud ("asterisk asterisk…"). */
export function plainSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim()
}
