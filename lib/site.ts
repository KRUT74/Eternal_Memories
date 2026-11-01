/** Public base URL, used for canonical links, the sitemap and social preview images. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "")

export const SITE_NAME = "Eternal Memories"
export const SITE_TITLE = "Eternal Memories: an AI companion with persistent memory"
export const SITE_DESCRIPTION =
  "A memory-persistent AI companion that remembers for you: the people, plans and details you care about, brought back the moment they matter. Built with Claude, Supabase pgvector and ElevenLabs voice."
