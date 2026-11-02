// One-off: gives memories stored before the memory upgrade a category, a subject
// and a core flag, the same way new memories get them when they're extracted.
//
//   node --env-file=.env.local scripts/backfill-memory-categories.mjs [--dry-run]

import Anthropic from "@anthropic-ai/sdk"

const DRY_RUN = process.argv.includes("--dry-run")
const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env
const headers = { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" }
const CATEGORIES = ["person", "health", "routine", "place", "preference", "plan", "other"]

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${pathAndQuery}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) throw new Error(`${pathAndQuery}: HTTP ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

// Only memories still on the defaults: never overwrite what extraction or a person set.
const memories = await rest("/memories?select=id,user_id,content&category=eq.other&subject=is.null&is_core=eq.false&pinned=eq.false&retired_at=is.null&order=user_id")
console.log(`${memories.length} memories to classify`)
if (memories.length === 0) process.exit(0)

const client = new Anthropic()
const response = await client.messages.create({
  model: "claude-haiku-5-5",
  max_tokens: 4000,
  system: `Classify each memory a personal AI companion holds about its user. For each, give:
- category: one of ${CATEGORIES.join(", ")}
- subject: the person, pet or thing it is about (e.g. "Leo"), or null if it's about the user generally
- core: true only if it would matter in almost any conversation: their own name, closest people and relationships, health conditions, medications and allergies, daily routines, where they live, what to do in an emergency. Most memories are not core.
Answer with JSON only: [{"n": 0, "category": "...", "subject": null, "core": false}, ...]`,
  messages: [{ role: "user", content: memories.map((m, n) => `[${n}] ${m.content}`).join("\n") }],
})
const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("")
const results = JSON.parse(text.slice(text.indexOf("["), text.lastIndexOf("]") + 1))

let updated = 0
for (const r of results) {
  const memory = memories[r.n]
  if (!memory || !CATEGORIES.includes(r.category)) continue
  const patch = { category: r.category, subject: r.subject || null, is_core: r.core === true }
  console.log(`${patch.is_core ? "core " : "     "} ${patch.category.padEnd(10)} ${(patch.subject ?? "").padEnd(10)} ${memory.content}`)
  if (!DRY_RUN) {
    await rest(`/memories?id=eq.${memory.id}`, { method: "PATCH", body: JSON.stringify(patch) })
    updated++
  }
}
console.log(DRY_RUN ? "dry run: nothing changed" : `${updated} memories updated`)
