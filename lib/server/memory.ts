import "server-only"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { anthropic, MEMORY_MODEL } from "./anthropic"
import { estimateCost } from "./usage"
import { embed } from "./embed"
import { supabase } from "./supabase"

export const CATEGORIES = ["person", "health", "routine", "place", "preference", "plan", "other"] as const
export type Category = (typeof CATEGORIES)[number]

export interface Memory {
  id: string
  content: string
  created_at: string
  category: Category
  subject: string | null
  /** Always included in replies: key people, health, routines, home. */
  is_core: boolean
  /** Set by the person: always included, and tidy-ups leave it alone. */
  pinned: boolean
}

interface MatchedMemory {
  id: string
  content: string
  similarity: number
  keyword_rank: number
  category: Category
  subject: string | null
  created_at: string
}

const MEMORY_COLUMNS = "id, content, created_at, category, subject, is_core, pinned"

// Search finds the closest memories by meaning (gte-small) and by keyword, fused
// in Postgres (search_memories). gte-small scores are compressed, so there's no
// useful similarity threshold: we pass the best few and let Claude judge relevance.
const RECALL_LIMIT = 12
// One memory brings related ones with it: others about the same person or thing
// as the best matches, so Leo's move also brings Leo's birthday.
const RELATED_FROM_TOP = 5
const RELATED_LIMIT = 6
// The core profile is included in every reply; past this many, the oldest
// non-pinned core memories wait for the next tidy-up to be consolidated.
const CORE_LIMIT = 40
// Above this, a "new" fact is treated as a restatement of one we already have.
const DUPLICATE_SIMILARITY = 0.95

/** Memories relevant to this message, excluding the core profile (always included anyway). */
export async function recall(userId: string, text: string): Promise<MatchedMemory[]> {
  const [queryEmbedding] = await embed([text])
  const { data, error } = await supabase().rpc("search_memories", {
    p_user_id: userId,
    query_embedding: queryEmbedding,
    query_text: text,
    match_count: RECALL_LIMIT,
  })
  if (error) throw error
  const matches = data as MatchedMemory[]
  return [...matches, ...(await relatedMemories(userId, matches))]
}

/** Memories about the same subjects as the best matches; they follow the matches in the list. */
async function relatedMemories(userId: string, matches: MatchedMemory[]): Promise<MatchedMemory[]> {
  const subjects = [...new Set(matches.slice(0, RELATED_FROM_TOP).flatMap((m) => (m.subject ? [m.subject] : [])))]
  if (subjects.length === 0) return []
  const { data, error } = await supabase()
    .from("memories")
    .select("id, content, category, subject, created_at")
    .eq("user_id", userId)
    .in("subject", subjects)
    .is("retired_at", null)
    .eq("is_core", false)
    .eq("pinned", false)
    .not("id", "in", `(${matches.map((m) => m.id).join(",")})`)
    .order("updated_at", { ascending: false })
    .limit(RELATED_LIMIT)
  if (error) throw error
  return (data as Omit<MatchedMemory, "similarity" | "keyword_rank">[]).map((m) => ({ ...m, similarity: 0, keyword_rank: 0 }))
}

/** The latest non-core memories, for the greeting. Core memories are always included anyway. */
export async function newestMemories(userId: string, limit: number): Promise<Memory[]> {
  const { data, error } = await supabase()
    .from("memories")
    .select(MEMORY_COLUMNS)
    .eq("user_id", userId)
    .is("retired_at", null)
    .eq("is_core", false)
    .eq("pinned", false)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return data as Memory[]
}

/** The core profile: pinned and core memories, included in every reply. */
export async function coreMemories(userId: string): Promise<Memory[]> {
  const { data, error } = await supabase()
    .from("memories")
    .select(MEMORY_COLUMNS)
    .eq("user_id", userId)
    .is("retired_at", null)
    .or("is_core.eq.true,pinned.eq.true")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(CORE_LIMIT)
  if (error) throw error
  return data as Memory[]
}

/** The core profile as a note for Claude, grouped by kind. */
export function describeCore(memories: Memory[]): string {
  const order: Category[] = ["person", "health", "routine", "place", "preference", "plan", "other"]
  const titles: Record<Category, string> = {
    person: "People",
    health: "Health",
    routine: "Routines",
    place: "Home and places",
    preference: "Likes and dislikes",
    plan: "Plans",
    other: "Other",
  }
  return order
    .map((category) => {
      const items = memories.filter((m) => m.category === category)
      return items.length ? `${titles[category]}:\n${items.map((m) => `- ${m.content}`).join("\n")}` : ""
    })
    .filter(Boolean)
    .join("\n")
}

export async function listMemories(userId: string): Promise<Memory[]> {
  const { data, error } = await supabase()
    .from("memories")
    .select(MEMORY_COLUMNS)
    .eq("user_id", userId)
    .is("retired_at", null)
    .order("created_at", { ascending: false })
  if (error) throw error
  return data as Memory[]
}

export async function setPinned(userId: string, id: string, pinned: boolean): Promise<Memory | null> {
  const { data, error } = await supabase()
    .from("memories")
    .update({ pinned, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .is("retired_at", null)
    .select(MEMORY_COLUMNS)
  if (error) throw error
  return (data?.[0] as Memory) ?? null
}

/** Brings back a memory a tidy-up or correction retired. */
export async function restoreMemory(userId: string, id: string): Promise<Memory | null> {
  const { data, error } = await supabase()
    .from("memories")
    .update({ retired_at: null, retired_reason: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("id", id)
    .not("retired_at", "is", null)
    .select(MEMORY_COLUMNS)
  if (error) throw error
  return (data?.[0] as Memory) ?? null
}

export async function retireMemories(userId: string, ids: string[], reason: string) {
  if (!ids.length) return
  const { error } = await supabase()
    .from("memories")
    .update({ retired_at: new Date().toISOString(), retired_reason: reason })
    .eq("user_id", userId)
    .in("id", ids)
  if (error) throw error
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
      category: z.enum(CATEGORIES),
      subject: z.string().nullable().describe("Who or what it is about, e.g. 'Leo' or 'Mixa'; null if it's about the user generally."),
      core: z.boolean().describe("True if it would matter in almost any conversation."),
      replaces_id: z
        .string()
        .nullable()
        .describe("id of a known memory this fact corrects or updates, otherwise null."),
    }),
  ),
})

const EXTRACTION_PROMPT = `You maintain the long-term memory of a personal AI companion.

Read the latest exchange and decide which facts about the user are worth remembering for future conversations: people in their life, important events, preferences, plans, goals, feelings about recurring topics. Also remember anything a caring friend would want to ask about next time: upcoming events with their date if given ("Has a scan on Thursday 12 November"), ongoing worries, and things they're waiting to hear about. Use the category "plan" for these. Write each as a short third-person sentence ("Their daughter Mia started school in September").

For each fact also give its category (person, health, routine, place, preference, plan, other), its subject (the person, pet or thing it's about, or null; always the same short name for the same person, e.g. "Leo"), and whether it is core. Core means it would matter in almost any conversation: the user's own name, their closest people and relationships, health conditions, medications and allergies, daily routines, where they live, and what to do in an emergency. Most facts are not core.

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
  known: Pick<Memory, "id" | "content">[],
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
        content: `Today is ${new Date().toISOString().slice(0, 10)}. Turn relative dates ("on Thursday") into real ones.\n\n<known_memories>\n${knownList}\n</known_memories>\n\n<user_message>\n${userMessage}\n</user_message>\n\n<assistant_reply>\n${assistantReply}\n</assistant_reply>`,
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
    // An update to a pinned or core fact (new medication dose, new carer) stays pinned/core.
    let carried = { pinned: false, is_core: false }

    if (replacesId) {
      const { data: old, error: oldError } = await supabase()
        .from("memories")
        .select("pinned, is_core")
        .eq("user_id", userId)
        .eq("id", replacesId)
        .maybeSingle()
      if (oldError) throw oldError
      if (old) carried = old
      // A correction ("Porto, not Lisbon") embeds almost identically to the fact it
      // replaces, so it must skip the near-duplicate check below. The old fact is
      // retired rather than deleted, so it can be restored.
      await retireMemories(userId, [replacesId], "corrected")
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
      .insert({
        user_id: userId,
        content: fact.content,
        embedding: embeddings[i],
        source_message_id: sourceMessageId,
        category: fact.category,
        subject: fact.subject?.trim() || null,
        is_core: fact.core || carried.is_core,
        pinned: carried.pinned,
      })
      .select(MEMORY_COLUMNS)
      .single()
    if (error) throw error
    stored.push(data as Memory)
  }

  return { stored, costUsd }
}

export async function deleteAllUserData(userId: string) {
  const { error } = await supabase().rpc("delete_user_data", { p_user_id: userId })
  if (error) throw error
}
