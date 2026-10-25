// Turns text into 384-dim gte-small embeddings using Supabase's built-in model.
// POST { "input": string | string[] }  →  { "embeddings": number[][] }
// Callers send the project secret key in the apikey header (Supabase's gateway requires it)
// and the shared secret in the x-embed-secret header.

const session = new Supabase.ai.Session("gte-small")
const MAX_INPUTS = 32

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 })

  const secret = Deno.env.get("EMBED_FUNCTION_SECRET")
  if (!secret || req.headers.get("x-embed-secret") !== secret) {
    return new Response("Unauthorized", { status: 401 })
  }

  let input: unknown
  try {
    ;({ input } = await req.json())
  } catch {
    return Response.json({ error: "Body must be JSON" }, { status: 400 })
  }

  const texts = typeof input === "string" ? [input] : input
  if (
    !Array.isArray(texts) ||
    texts.length === 0 ||
    texts.length > MAX_INPUTS ||
    !texts.every((t) => typeof t === "string" && t.trim().length > 0)
  ) {
    return Response.json({ error: `input must be a non-empty string or 1-${MAX_INPUTS} strings` }, { status: 400 })
  }

  const embeddings: number[][] = []
  for (const text of texts) {
    embeddings.push((await session.run(text, { mean_pool: true, normalize: true })) as number[])
  }

  return Response.json({ embeddings })
})
