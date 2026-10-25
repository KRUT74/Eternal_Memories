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

Open **SQL Editor** → **New query**, paste the contents of
`supabase/migrations/20261025000000_memory.sql`, and click **Run**.
You should see `messages` and `memories` under **Table Editor**.

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

## 6. Local env file

```bash
cp .env.example .env.local
```

Fill in the four values in `.env.local`.

## 7. Check the embedding function

```bash
curl -s -X POST "https://<project ref>.supabase.co/functions/v1/embed" -H "Content-Type: application/json" -H "apikey: <SUPABASE_SECRET_KEY>" -H "x-embed-secret: <secret from step 3>" -d '{"input":"hello"}' | head -c 120
```

You should see `{"embeddings":[[` followed by numbers.
