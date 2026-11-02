import "server-only"
import { z } from "zod"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { anthropic, MEMORY_MODEL } from "./anthropic"
import { embed } from "./embed"
import { CATEGORIES, retireMemories, type Category, type Memory } from "./memory"
import { supabase } from "./supabase"
import { checkSpendAllowed, estimateCost, recordUsage } from "./usage"

// Tidy-ups keep a growing memory useful: Claude merges overlapping facts, updates
// out-of-date ones, retires what no longer applies and adjusts the core profile.
// Every change is logged with enough detail to undo it, and retired memories are
// kept for 30 days. Pinned memories are never changed.

const TIDY_AFTER_NEW_MEMORIES = 25
const TIDY_AFTER_DAYS = 7
const MAX_MEMORIES_PER_TIDY = 600
const RESTORE_DAYS = 30

export type TidyChange =
  | { op: "merge"; sources: { id: string; content: string }[]; created: { id: string; content: string }; reason: string; undone?: boolean }
  | { op: "update"; id: string; before: string; after: string; reason: string; undone?: boolean }
  | { op: "retire"; id: string; content: string; reason: string; undone?: boolean }
  | { op: "core"; id: string; content: string; core: boolean; reason: string; undone?: boolean }

export interface TidyRun {
  id: string
  created_at: string
  merged: number
  updated: number
  retired: number
  core_changed: number
  changes: TidyChange[]
}

const OperationsSchema = z.object({
  operations: z.array(
    z.object({
      op: z.enum(["merge", "update", "retire", "core"]),
      refs: z.array(z.number().int()).describe("The [n] numbers of the memories this operation is about."),
      content: z.string().nullable().describe("merge/update: the new single sentence. Otherwise null."),
      category: z.enum(CATEGORIES).nullable(),
      subject: z.string().nullable(),
      core: z.boolean().nullable().describe("core: whether the memory should be core. merge: whether the result is core."),
      reason: z.string().describe("A few plain words for the person, e.g. 'Leo moved to Lisbon'."),
    }),
  ),
})

const TIDY_PROMPT = `You look after the long-term memory of a personal AI companion. Some of the people using it have memory difficulties, so accuracy matters more than tidiness.

You'll get every memory about one person, numbered [n], with its category, subject, date and flags. Return operations that make the memory clearer:

- merge: two or more memories that say overlapping things about the same subject. Write one sentence that keeps every detail. Don't merge facts that are merely related.
- update: one memory that is vague or awkwardly worded. Only rephrase; never add information.
- retire: a memory that is fully covered by a newer one ("lives in Porto" once "moved from Porto to Lisbon" exists), an exact duplicate, or a plan whose date has clearly passed. Give the reason.
- core: set or clear the core flag on one memory. Core means it matters in almost any conversation: their own name, closest people and relationships, health conditions, medications and allergies, daily routines, where they live, what to do in an emergency. Go through every memory: flag each one that meets this and isn't flagged yet (memories saved before flags existed often aren't), and clear the flag where it doesn't fit. Aim for a focused core of roughly 10 to 30.

Rules: never invent or guess facts. Retire anything that isn't a fact about the person at all (a stray note, a half sentence). When two memories conflict, trust the newer one. Never include memories marked pinned. Each memory may appear in at most one operation. Most memories need no change; return an empty list if nothing needs doing.`

/** Runs a tidy-up when enough has changed since the last one, and the budget allows. */
export async function maybeTidy(userId: string, ipHash: string): Promise<TidyRun | null> {
  const db = supabase()
  const { data: last, error } = await db
    .from("memory_tidy_runs")
    .select("created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  let newSince = db.from("memories").select("id", { count: "exact", head: true }).eq("user_id", userId).is("retired_at", null)
  if (last) newSince = newSince.gt("created_at", last.created_at)
  const { count, error: countError } = await newSince
  if (countError) throw countError
  const added = count ?? 0

  const daysSince = last ? (Date.now() - new Date(last.created_at).getTime()) / 86_400_000 : 0
  const due = added >= TIDY_AFTER_NEW_MEMORIES || (last !== null && daysSince >= TIDY_AFTER_DAYS && added > 0)
  if (!due) return null
  if (!(await checkSpendAllowed(userId, ipHash)).ok) return null
  return runTidy(userId, ipHash)
}

export async function runTidy(userId: string, ipHash: string): Promise<TidyRun> {
  const db = supabase()

  // Retired memories can be restored for 30 days; after that they're deleted.
  await db
    .from("memories")
    .delete()
    .eq("user_id", userId)
    .lt("retired_at", new Date(Date.now() - RESTORE_DAYS * 86_400_000).toISOString())

  const { data, error } = await db
    .from("memories")
    .select("id, content, created_at, category, subject, is_core, pinned")
    .eq("user_id", userId)
    .is("retired_at", null)
    .order("created_at", { ascending: false })
    .limit(MAX_MEMORIES_PER_TIDY)
  if (error) throw error
  const memories = (data as Memory[]).sort(
    (a, b) => (a.subject ?? "~").localeCompare(b.subject ?? "~") || a.created_at.localeCompare(b.created_at),
  )

  // Short numbers instead of UUIDs: fewer tokens, and no invented IDs.
  const listing = memories
    .map((m, i) => {
      const flags = [m.category, m.subject, m.created_at.slice(0, 10), m.is_core && "core", m.pinned && "pinned"].filter(Boolean)
      return `[${i}] (${flags.join(" · ")}) ${m.content}`
    })
    .join("\n")

  const response = await anthropic().messages.parse({
    model: MEMORY_MODEL,
    max_tokens: 8000,
    output_config: { effort: "medium", format: zodOutputFormat(OperationsSchema) },
    system: TIDY_PROMPT,
    messages: [{ role: "user", content: `Today is ${new Date().toISOString().slice(0, 10)}.\n\n<memories>\n${listing}\n</memories>` }],
  })
  const costUsd = estimateCost(response.model, response.usage)

  const changes: TidyChange[] = []
  const used = new Set<number>()
  const operations = response.stop_reason === "refusal" ? [] : (response.parsed_output?.operations ?? [])

  for (const op of operations) {
    const refs = [...new Set(op.refs)]
    // Ignore anything that points at unknown, pinned or already-changed memories.
    if (!refs.length || refs.some((r) => !memories[r] || memories[r].pinned || used.has(r))) continue
    const targets = refs.map((r) => memories[r])
    const content = op.content?.trim()

    if (op.op === "merge" && targets.length >= 2 && content) {
      const [embedding] = await embed([content])
      const { data: created, error: insertError } = await db
        .from("memories")
        .insert({
          user_id: userId,
          content,
          embedding,
          category: op.category ?? mostCommon(targets.map((t) => t.category)),
          subject: op.subject?.trim() || targets.find((t) => t.subject)?.subject || null,
          is_core: op.core ?? targets.some((t) => t.is_core),
        })
        .select("id, content")
        .single()
      if (insertError) throw insertError
      await retireMemories(userId, targets.map((t) => t.id), "merged")
      changes.push({ op: "merge", sources: targets.map(({ id, content }) => ({ id, content })), created, reason: op.reason })
    } else if (op.op === "update" && targets.length === 1 && content && content !== targets[0].content) {
      const [embedding] = await embed([content])
      const { error: updateError } = await db
        .from("memories")
        .update({ content, embedding, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", targets[0].id)
      if (updateError) throw updateError
      changes.push({ op: "update", id: targets[0].id, before: targets[0].content, after: content, reason: op.reason })
    } else if (op.op === "retire" && targets.length === 1) {
      await retireMemories(userId, [targets[0].id], op.reason)
      changes.push({ op: "retire", id: targets[0].id, content: targets[0].content, reason: op.reason })
    } else if (op.op === "core" && targets.length === 1 && op.core !== null && op.core !== targets[0].is_core) {
      const { error: coreError } = await db
        .from("memories")
        .update({ is_core: op.core, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", targets[0].id)
      if (coreError) throw coreError
      changes.push({ op: "core", id: targets[0].id, content: targets[0].content, core: op.core, reason: op.reason })
    } else {
      continue
    }
    refs.forEach((r) => used.add(r))
  }

  const { data: run, error: runError } = await db
    .from("memory_tidy_runs")
    .insert({
      user_id: userId,
      memories_before: memories.length,
      merged: changes.filter((c) => c.op === "merge").length,
      updated: changes.filter((c) => c.op === "update").length,
      retired: changes.filter((c) => c.op === "retire").length,
      core_changed: changes.filter((c) => c.op === "core").length,
      changes,
      cost_usd: costUsd,
    })
    .select("id, created_at, merged, updated, retired, core_changed, changes")
    .single()
  if (runError) throw runError
  await recordUsage("tidy", userId, ipHash, costUsd)
  return run as TidyRun
}

export async function lastTidy(userId: string): Promise<TidyRun | null> {
  const { data, error } = await supabase()
    .from("memory_tidy_runs")
    .select("id, created_at, merged, updated, retired, core_changed, changes")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data as TidyRun | null
}

/** Reverses one change from a tidy-up. Returns false if it can't be found or was already undone. */
export async function undoTidyChange(userId: string, runId: string, index: number): Promise<boolean> {
  const db = supabase()
  const { data: run, error } = await db
    .from("memory_tidy_runs")
    .select("changes")
    .eq("user_id", userId)
    .eq("id", runId)
    .maybeSingle()
  if (error) throw error
  const changes = (run?.changes ?? []) as TidyChange[]
  const change = changes[index]
  if (!change || change.undone) return false

  const restore = async (ids: string[]) => {
    const { error: restoreError } = await db
      .from("memories")
      .update({ retired_at: null, retired_reason: null })
      .eq("user_id", userId)
      .in("id", ids)
    if (restoreError) throw restoreError
  }

  if (change.op === "merge") {
    await restore(change.sources.map((s) => s.id))
    await retireMemories(userId, [change.created.id], "merge undone")
  } else if (change.op === "retire") {
    await restore([change.id])
  } else if (change.op === "update") {
    const [embedding] = await embed([change.before])
    const { error: revertError } = await db
      .from("memories")
      .update({ content: change.before, embedding, updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("id", change.id)
    if (revertError) throw revertError
  } else {
    const { error: coreError } = await db.from("memories").update({ is_core: !change.core }).eq("user_id", userId).eq("id", change.id)
    if (coreError) throw coreError
  }

  changes[index] = { ...change, undone: true }
  const { error: saveError } = await db.from("memory_tidy_runs").update({ changes }).eq("user_id", userId).eq("id", runId)
  if (saveError) throw saveError
  return true
}

function mostCommon(values: Category[]): Category {
  const counts = new Map<Category, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
}
