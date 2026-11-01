-- Face sign-in with passkeys. The face (or fingerprint, or device PIN) is checked
-- on the person's own device; only the passkey's public key is stored here, so
-- no biometric data ever reaches this database. Server-only, like accounts:
-- RLS is on with no policies.

create table public.passkeys (
  -- WebAuthn credential ID (base64url).
  id text primary key,
  -- Deleting the account ("forget everything") removes its passkeys too.
  user_id text not null references public.accounts(id) on delete cascade,
  public_key text not null,
  counter bigint not null default 0,
  transports text[] not null default '{}',
  device_label text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index passkeys_user_idx on public.passkeys (user_id);

-- One-time challenges for setting up a passkey or signing in with one. Each is
-- consumed once (consumed_at), expires after a few minutes, and is counted per
-- network for rate limiting.
create table public.passkey_challenges (
  challenge text primary key,
  purpose text not null check (purpose in ('register', 'login')),
  -- Set for 'register': the account the new passkey will belong to.
  user_id text,
  ip_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index passkey_challenges_ip_idx on public.passkey_challenges (ip_hash, created_at);

alter table public.passkeys enable row level security;
alter table public.passkey_challenges enable row level security;
