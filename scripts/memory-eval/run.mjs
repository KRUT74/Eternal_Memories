// Memory recall test: how often does the right memory reach Claude?
//
// Seeds a throwaway user with ~45 key memories (targets.json) and ~370 everyday
// background memories (background.json), asks the questions in questions.json,
// and scores what each recall strategy would put in front of Claude.
// The test user is deleted afterwards.
//
//   node --env-file=.env.local scripts/memory-eval/run.mjs [baseline|upgrade|linked|tidy]
//
// baseline: meaning-only search, as before the memory upgrade.
// upgrade:  keyword + meaning search, plus the core profile (core flags from the test data).
// linked:   like upgrade, plus related memories: others about the same person as the
//           best matches (subjects here come from the names in the text).
// tidy:     like upgrade, but nothing starts as core: a real tidy-up through the
//           local app (http://localhost:3107) decides, merges and retires first.

import { createHmac } from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const DIR = path.dirname(new URL(import.meta.url).pathname)
const STRATEGY = process.argv[2] ?? "baseline"
const USER = "u_eval_memory_test"
const TOP_K = 12

const { SUPABASE_URL, SUPABASE_SECRET_KEY, EMBED_FUNCTION_SECRET } = process.env
const headers = { apikey: SUPABASE_SECRET_KEY, Authorization: `Bearer ${SUPABASE_SECRET_KEY}`, "Content-Type": "application/json" }

const targets = JSON.parse(fs.readFileSync(path.join(DIR, "targets.json"), "utf8"))
const background = JSON.parse(fs.readFileSync(path.join(DIR, "background.json"), "utf8"))
const questions = JSON.parse(fs.readFileSync(path.join(DIR, "questions.json"), "utf8"))
// Facts that were later corrected: seeing them alongside the new version risks confusion.
const STALE = ["leo_old", "carer_old"]

async function rest(pathAndQuery, init = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${pathAndQuery}`, { ...init, headers: { ...headers, ...init.headers } })
  if (!res.ok) throw new Error(`${pathAndQuery}: HTTP ${res.status} ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

// Embeddings are cached on disk: the texts don't change between runs.
const CACHE = path.join(DIR, ".embeddings-cache.json")
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {}
async function embedBatch(batch, attempt = 1) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/embed`, {
    method: "POST",
    headers: { ...headers, "x-embed-secret": EMBED_FUNCTION_SECRET },
    body: JSON.stringify({ input: batch }),
  })
  if (res.ok) return (await res.json()).embeddings
  // The free edge function runs out of compute (HTTP 546) when pushed; back off and retry.
  if (attempt < 6) {
    await new Promise((r) => setTimeout(r, 1500 * attempt))
    return embedBatch(batch, attempt + 1)
  }
  throw new Error(`embed: HTTP ${res.status} ${await res.text()}`)
}

async function embed(texts) {
  const missing = [...new Set(texts.filter((t) => !cache[t]))]
  for (let i = 0; i < missing.length; i += 4) {
    const batch = missing.slice(i, i + 4)
    const embeddings = await embedBatch(batch)
    batch.forEach((t, k) => (cache[t] = embeddings[k]))
    process.stdout.write(`\rembedding ${Math.min(i + 4, missing.length)}/${missing.length}`)
    if (i % 40 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache))
  }
  if (missing.length) {
    process.stdout.write("\n")
    fs.writeFileSync(CACHE, JSON.stringify(cache))
  }
  return texts.map((t) => cache[t])
}

const NAMES = /\b(Leo|Ana|Marc|Claire|Lucía|Pau|Jordi|Montse|Carme|Mixa|Núria|Sílvia|Dr\. Patel|Dr\. Serra)\b/
const vector = (v) => `[${v.join(",")}]`

async function seed() {
  await rest(`/memories?user_id=eq.${USER}`, { method: "DELETE" })
  const all = [...targets.map((t) => ({ ...t })), ...background.map((content) => ({ content }))]
  const embeddings = await embed(all.map((m) => m.content))
  const rows = all.map((m, i) => ({
    user_id: USER,
    content: m.content,
    embedding: vector(embeddings[i]),
    ...(STRATEGY === "upgrade" || STRATEGY === "linked" ? { is_core: Boolean(m.core) } : {}),
    ...(STRATEGY === "linked" ? { subject: NAMES.exec(m.content)?.[0] ?? null } : {}),
  }))
  const inserted = []
  for (let i = 0; i < rows.length; i += 100) {
    inserted.push(...(await rest("/memories?select=id,content", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(rows.slice(i, i + 100)) })))
  }
  const keyById = new Map()
  for (const row of inserted) {
    const target = targets.find((t) => t.content === row.content)
    if (target) keyById.set(row.id, [target.key])
  }
  return keyById
}

/** The memory IDs each strategy would show Claude for this question. */
async function contextFor(question, embedding) {
  if (STRATEGY === "baseline") {
    const rows = await rest("/rpc/match_memories", {
      method: "POST",
      body: JSON.stringify({ p_user_id: USER, query_embedding: vector(embedding), match_count: TOP_K, min_similarity: 0.7 }),
    })
    return rows.map((r) => r.id)
  }
  const [core, found] = await Promise.all([
    rest(`/memories?user_id=eq.${USER}&is_core=eq.true&retired_at=is.null&select=id`),
    rest("/rpc/search_memories", {
      method: "POST",
      body: JSON.stringify({ p_user_id: USER, query_embedding: vector(embedding), query_text: question, match_count: TOP_K }),
    }),
  ])
  const ids = [...core.map((r) => r.id), ...found.map((r) => r.id)]
  if (STRATEGY !== "linked") return ids
  // The same query as relatedMemories in lib/server/memory.ts.
  const subjects = [...new Set(found.slice(0, 5).flatMap((r) => (r.subject ? [r.subject] : [])))]
  if (subjects.length === 0) return ids
  const related = await rest(
    `/memories?user_id=eq.${USER}&retired_at=is.null&is_core=eq.false&pinned=eq.false&subject=in.(${subjects.map((x) => `"${x}"`).join(",")})` +
      `&id=not.in.(${found.map((r) => r.id).join(",")})&select=id&order=updated_at.desc&limit=6`,
  )
  return [...ids, ...related.map((r) => r.id)]
}

/** Runs a real tidy-up via the local app's "Tidy up now" endpoint, as the test user. */
async function tidyThroughApp(keyById) {
  await rest(`/memory_tidy_runs?user_id=eq.${USER}`, { method: "DELETE" })
  const payload = Buffer.from(JSON.stringify({ u: USER, n: "Eval", k: "guest" })).toString("base64url")
  const cookie = `em_session=${payload}.${createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("base64url")}`
  const started = Date.now()
  const res = await fetch("http://localhost:3107/api/memories/tidy", { method: "POST", headers: { Cookie: cookie } })
  if (!res.ok) throw new Error(`tidy: HTTP ${res.status} ${await res.text()}`)
  const { run } = await res.json()
  const [{ cost_usd }] = await rest(`/memory_tidy_runs?id=eq.${run.id}&select=cost_usd`)
  console.log(
    `tidy-up: ${run.merged} merged, ${run.updated} reworded, ${run.retired} retired, ${run.core_changed} core changes` +
      ` in ${Math.round((Date.now() - started) / 1000)}s, $${Number(cost_usd).toFixed(4)}`,
  )
  const label = (id) => (keyById.get(id) ? `${keyById.get(id).join("+")}*` : "bg")
  for (const c of run.changes) {
    const ids = c.op === "merge" ? c.sources.map((s) => s.id) : [c.id]
    const text = c.op === "merge" ? c.created.content : c.op === "update" ? c.after : c.content
    console.log(`  ${c.op.padEnd(6)} [${ids.map(label).join(", ")}] ${c.op === "core" ? (c.core ? "+core " : "-core ") : ""}${text}  (${c.reason})`)
  }
  // A merged memory carries the keys of what it replaced, except outdated facts
  // it was merged with (the merge keeps the newer version).
  for (const c of run.changes) {
    if (c.op !== "merge") continue
    const keys = c.sources.flatMap((s) => keyById.get(s.id) ?? [])
    const current = keys.filter((k) => !STALE.includes(k))
    if (keys.length) keyById.set(c.created.id, current.length ? current : keys)
  }
  const core = await rest(`/memories?user_id=eq.${USER}&is_core=eq.true&retired_at=is.null&select=id`)
  const coreTargets = new Set(core.flatMap((r) => keyById.get(r.id) ?? []))
  console.log(`core after tidy-up: ${core.length} memories, ${targets.filter((t) => t.core && coreTargets.has(t.key)).length}/${targets.filter((t) => t.core).length} of the expected core facts`)
}

const coreKeys = targets.filter((t) => t.core).map((t) => t.key)

try {
  console.log(`strategy: ${STRATEGY} | ${targets.length} key + ${background.length} background memories | ${questions.length} questions`)
  const keyById = await seed()
  if (STRATEGY === "tidy") await tidyThroughApp(keyById)
  const questionEmbeddings = await embed(questions.map((q) => q.q))

  let found = 0
  let expected = 0
  let coreSeen = 0
  let staleSeen = 0
  const misses = []
  for (const [i, { q, expect }] of questions.entries()) {
    const keys = new Set((await contextFor(q, questionEmbeddings[i])).flatMap((id) => keyById.get(id) ?? []))
    const hits = expect.filter((k) => keys.has(k))
    found += hits.length
    expected += expect.length
    coreSeen += coreKeys.filter((k) => keys.has(k)).length / coreKeys.length
    staleSeen += STALE.some((k) => keys.has(k)) ? 1 : 0
    if (hits.length < expect.length) misses.push(`  missed ${expect.filter((k) => !keys.has(k)).join(", ")}: "${q}"`)
  }

  const pct = (n) => `${Math.round(n * 100)}%`
  console.log(`\nright memory reached Claude: ${found}/${expected} (${pct(found / expected)})`)
  console.log(`core facts in context, on average: ${pct(coreSeen / questions.length)}`)
  console.log(`questions where an outdated fact was also shown: ${staleSeen}`)
  if (misses.length) console.log(`\n${misses.join("\n")}`)
} finally {
  await rest(`/memories?user_id=eq.${USER}`, { method: "DELETE" })
  await rest(`/memory_tidy_runs?user_id=eq.${USER}`, { method: "DELETE" })
  await rest(`/usage_events?user_id=eq.${USER}`, { method: "DELETE" })
}
