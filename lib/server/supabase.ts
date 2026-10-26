import "server-only"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { env } from "./env"

let client: SupabaseClient | null = null

// Server-side client using the secret key. Tables have RLS on with no policies,
// so this is the only way in.
export function supabase(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return client
}
