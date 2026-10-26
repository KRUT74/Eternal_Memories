# Setup: Supabase + Anthropic

Everything here is free to start. Keys go only in `.env.local` (git-ignored) and in
Vercel's environment variables — never in code.

## 1. Supabase project (free tier)

1. Sign in at <https://supabase.com/dashboard> and click **New project**.
2. Name it `eternal-memories`, pick the region closest to your users, and generate a
   database password. Save the password in your password manager; you need it once in step 4.
3. When the project is ready, open **Project Settings**:
   - **Data API** → copy the **Project URL** → `SUPABASE_URL`
   - **API Keys** → create/copy a **secret key** (`sb_secret_…`) → `SUPABASE_SECRET_KEY`.
     This key bypasses row-level security, so it must only ever live on the server.
   - Note the **project ref** (the `xxxx` in `https://xxxx.supabase.co`).

## 2. Database tables

Open **SQL Editor** → **Create a new snippet**, and run each file in
`supabase/migrations/` in order (paste, then **Run**):

1. `20261025000000_memory.sql`: `messages`, `memories` and the memory search function
2. `20261026000000_usage_limits.sql`: the usage log behind rate limits and the daily budget
3. `20261027000000_voice_usage.sql`: logs voice costs and adds the per-visitor spend cap
4. `20261027100000_accounts.sql`: email accounts and one-time sign-in codes

Each should report "Success. No rows returned."

## 3. Shared secret for the embedding function

Generate a random secret and keep it for steps 4 and 6. Use the 64-character code this
prints, not the command itself:

```bash
openssl rand -hex 32
```

## 4. Deploy the embedding function (dashboard)

1. **Edge Functions → Secrets**: add `EMBED_FUNCTION_SECRET` with the value from step 3.
2. **Edge Functions → Deploy a new function → Via Editor**: name it `embed`, replace *all*
   the sample code with `supabase/functions/embed/index.ts`, and click **Deploy**.
3. In the function's **Details**, turn off **Verify JWT**. The new `sb_secret_` keys are not
   JWTs, so the function checks its own `x-embed-secret` header instead.

CLI alternative: `npx supabase@2.122.0 login`, then
`npx supabase@2.122.0 secrets set EMBED_FUNCTION_SECRET=... --project-ref <ref>` and
`npx supabase@2.122.0 functions deploy embed --project-ref <ref>`.

## 5. Anthropic API key

1. Sign in at <https://console.anthropic.com>.
2. **Settings → Workspaces**: create a workspace called `eternal-memories` and give it a
   monthly **spend limit** (for example $10). The public demo can then never cost more.
3. **Settings → API keys** → **Create key** in that workspace → `ANTHROPIC_API_KEY`.
4. **Billing**: add a small amount of credit if the account has none.

## 6. ElevenLabs (voice)

1. Sign in at <https://elevenlabs.io> and open **Developers → API Keys**.
2. Create a key with access to **Text to Speech** and **Speech to Text** only, and set a usage
   limit on it if the option is offered → `ELEVENLABS_API_KEY`.
3. Pick the companion's voice in the voice library and copy its ID → `ELEVENLABS_VOICE_ID`.

Voice costs roughly $0.02 per spoken turn (Flash v2.5 at $0.05 per 1K characters plus Scribe
realtime at $0.39 per hour). The app counts it against the same daily budgets as chat.

## 7. Resend (email sign-in codes)

1. Sign up at <https://resend.com> and create an API key with **Sending access** → `RESEND_API_KEY`.
2. Without a domain, Resend's test sender (`onboarding@resend.dev`) only delivers to the email
   you signed up with, which is fine for local testing.
3. To let anyone sign in with email you need your own domain. This project uses
   `eternalmemories.space` (registered at Hostinger, with DNS hosted by Vercel):
   - In Vercel → project → **Domains**, add the domain, then at the registrar replace the
     nameservers with the two Vercel nameservers shown on the domain's **Vercel DNS** tab.
   - In Resend → **Domains**, add the domain and copy each DNS record it lists into Vercel →
     **Domains → (domain) → DNS Records**. Wait for Resend to show "Verified".
   - In Vercel environment variables set `RESEND_API_KEY`, `EMAIL_FROM=Eternal Memories <hello@eternalmemories.space>`,
     `EMAIL_SIGNIN_ENABLED=true` and `NEXT_PUBLIC_SITE_URL=https://www.eternalmemories.space` (Vercel serves
     `www` as the main address and redirects the bare domain to it), then redeploy.

   Until a domain is verified, leave `EMAIL_SIGNIN_ENABLED` off: visitors can still try the app
   as guests.

## 8. Local env file

```bash
cp .env.example .env.local
```

Fill in the values in `.env.local`. For `SESSION_SECRET` (signs visitor cookies), use
another `openssl rand -hex 32`. The optional `DEMO_*` settings tune the demo limits; the
defaults are a $2 rolling-24-hour budget for the whole demo, $0.30 per visitor, 5 messages a
minute and 40 a day per visitor, and 100 messages and 5 new sessions a day per network.

## 9. Check the embedding function

```bash
curl -s -X POST "https://<project ref>.supabase.co/functions/v1/embed" -H "Content-Type: application/json" -H "apikey: <SUPABASE_SECRET_KEY>" -H "x-embed-secret: <secret from step 3>" -d '{"input":"hello"}' | head -c 120
```

You should see `{"embeddings":[[` followed by numbers.
