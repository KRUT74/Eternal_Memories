import "server-only"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { anthropic, MEMORY_MODEL } from "./anthropic"
import { estimateCost } from "./usage"
import { embed } from "./embed"
import { supabase } from "./supabase"

export interface Memory {
  id: string
  content: string
  created_at: string
}

interface MatchedMemory extends Memory {
  similarity: number
}

// gte-small scores are compressed: direct matches score ~0.81-0.83, indirect but
// relevant ones ("school run" -> "daughter started school") ~0.79-0.80, and
// unrelated facts ~0.73-0.77, so no threshold separates them. Instead we pass the
// closest few memories and let Claude judge relevance; the floor only drops junk.
const RECALL_MIN_SIMILARITY = 0.7
const RECALL_LIMIT = 12
// Above this, a "new" fact is treated as a restatement of one we already have.
const DUPLICATE_SIMILARITY = 0.95

export async function recall(userId: string, text: string): Promise<MatchedMemory[]> {
  const [queryEmbedding] = await embed([text])
  const { data, error } = await supabase().rpc("match_memories", {
    p_user_id: userId,
    query_embedding: queryEmbedding,
    match_count: RECALL_LIMIT,
    min_similarity: RECALL_MIN_SIMILARITY,
  })
  if (error) throw error
  return data as MatchedMemory[]
}

export async function listMemories(userId: string): Promise<Memory[]> {
  const { data, error } = await supabase()
    .from("memories")
    .select("id, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data
}

export async function forgetMemory(userId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase().from("memories").delete().eq("user_id", userId).eq("id", id).select("id")
  if (error) throw error
  return data.length > 0
}

const ExtractionSchema = z.object({
  memories: z.array(
    z.object({
      content: z.string().describe("One durable fact about the user, as a short third-person sentence."),
      replaces_id: z
        .string()
        .nullable()
        .describe("id of a known memory this fact corrects or updates, otherwise null."),
    }),
  ),
})

const EXTRACTION_PROMPT = `You maintain the long-term memory of a personal AI companion.

Read the latest exchange and decide which facts about the user are worth remembering for future conversations: people in their life, important events, preferences, plans, goals, feelings about recurring topics. Write each as a short third-person sentence ("Their daughter Mia started school in September").

Only record what the user said or clearly confirmed about themselves. Skip small talk, questions, passing moods and one-off moments ("had a rough day", "is tired today"), and anything the assistant said that the user didn't confirm. Don't repeat facts already in the known memories. If the user corrects or updates a known memory, return the new version with that memory's id in replaces_id.

Most exchanges contain nothing new; return an empty list then.`

/**
 * Pulls durable facts out of one exchange and stores them.
 * Returns the newly stored memories and the estimated cost of the extraction call.
 */
export async function extractAndStore(
  userId: string,
  userMessage: string,
  assistantReply: string,
  known: Memory[],
  sourceMessageId: string | null,
): Promise<{ stored: Memory[]; costUsd: number }> {
  const knownList = known.length
    ? known.map((m) => `- [${m.id}] ${m.content}`).join("\n")
    : "(none yet)"

  const response = await anthropic().messages.parse({
    model: MEMORY_MODEL,
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
    system: EXTRACTION_PROMPT,
    messages: [
      {
        role: "user",
        content: `<known_memories>\n${knownList}\n</known_memories>\n\n<user_message>\n${userMessage}\n</user_message>\n\n<assistant_reply>\n${assistantReply}\n</assistant_reply>`,
      },
    ],
  })

  const costUsd = estimateCost(response.model, response.usage)
  if (response.stop_reason === "refusal" || !response.parsed_output) return { stored: [], costUsd }
  const facts = response.parsed_output.memories.filter((m) => m.content.trim())
  if (facts.length === 0) return { stored: [], costUsd }

  const embeddings = await embed(facts.map((f) => f.content))
  const knownIds = new Set(known.map((m) => m.id))
  const stored: Memory[] = []

  for (const [i, fact] of facts.entries()) {
    const replacesId = fact.replaces_id && knownIds.has(fact.replaces_id) ? fact.replaces_id : null

    if (replacesId) {
      // A correction ("Porto, not Lisbon") embeds almost identically to the fact it
      // replaces, so it must skip the near-duplicate check below.
      await forgetMemory(userId, replacesId)
    } else {
      const { data: nearest, error: matchError } = await supabase().rpc("match_memories", {
        p_user_id: userId,
        query_embedding: embeddings[i],
        match_count: 1,
        min_similarity: DUPLICATE_SIMILARITY,
      })
      if (matchError) throw matchError
      if ((nearest as MatchedMemory[]).length > 0) continue
    }

    const { data, error } = await supabase()
      .from("memories")
      .insert({ user_id: userId, content: fact.content, embedding: embeddings[i], source_message_id: sourceMessageId })
      .select("id, content, created_at")
      .single()
    if (error) throw error
    stored.push(data)
  }

  return { stored, costUsd }
}

export async function deleteAllUserData(userId: string) {
  const { error } = await supabase().rpc("delete_user_data", { p_user_id: userId })
  if (error) throw error
}
