import "server-only"
import { env } from "./env"

// The edge function runs out of CPU time (HTTP 546) on ~10 texts in one call.
const BATCH_SIZE = 4

/** 384-dim gte-small embeddings from the Supabase `embed` edge function. */
export async function embed(texts: string[]): Promise<number[][]> {
  const batches: string[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) batches.push(texts.slice(i, i + BATCH_SIZE))
  return (await Promise.all(batches.map(embedBatch))).flat()
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await fetch(`${env.supabaseUrl}/functions/v1/embed`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: env.supabaseSecretKey,
      "x-embed-secret": env.embedFunctionSecret,
    },
    body: JSON.stringify({ input: texts }),
  })
  if (!response.ok) {
    throw new Error(`Embedding failed: HTTP ${response.status} ${await response.text()}`)
  }
  const { embeddings } = (await response.json()) as { embeddings: number[][] }
  return embeddings
}
