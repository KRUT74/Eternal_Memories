/** Public base URL, used for canonical links, the sitemap and social preview images. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "")

export const SITE_NAME = "Eternal Memories"
export const SITE_TITLE = "Eternal Memories: an AI companion that remembers"
export const SITE_DESCRIPTION =
  "Talk or type with an AI companion that remembers the people, plans and things you care about, across every conversation. Built with Claude, Supabase pgvector and ElevenLabs voice."
