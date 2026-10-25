import "server-only"

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}. See .env.example and docs/SETUP.md.`)
  return value
}

export const env = {
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY")
  },
  get supabaseUrl() {
    return required("SUPABASE_URL")
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY")
  },
  get embedFunctionSecret() {
    return required("EMBED_FUNCTION_SECRET")
  },
}
