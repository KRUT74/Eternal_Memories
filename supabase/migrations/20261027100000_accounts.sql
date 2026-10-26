-- Email sign-in: verified accounts and one-time codes.
-- Guests keep random IDs (u_…); email accounts get a stable ID (a_…) so their
-- memories follow them across devices. Only the server (secret key) can reach
-- these tables: RLS is on with no policies.

create table public.accounts (
  id text primary key,
  email text not null unique check (email = lower(email)),
  name text not null,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- One row per code sent. Only an HMAC of the code is stored.
create table public.email_codes (
  id bigint generated always as identity primary key,
  email text not null,
  code_hash text not null,
  ip_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index email_codes_email_idx on public.email_codes (email, created_at);
create index email_codes_ip_idx on public.email_codes (ip_hash, created_at);

alter table public.accounts enable row level security;
alter table public.email_codes enable row level security;

-- Checks a code against the newest unused code for the email, atomically, so
-- parallel guesses can't skip the attempt counter. Returns:
-- 'ok' (code consumed) | 'invalid' | 'too_many' | 'expired' | 'none'
create or replace function public.consume_email_code(p_email text, p_code_hash text, p_max_attempts int)
returns text
language plpgsql
set search_path = public
as $$
declare
  c public.email_codes%rowtype;
begin
  select * into c from public.email_codes
  where email = p_email and consumed_at is null
  order by created_at desc
  limit 1
  for update;

  if not found then return 'none'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= p_max_attempts then return 'too_many'; end if;

  if c.code_hash = p_code_hash then
    update public.email_codes set consumed_at = now() where id = c.id;
    return 'ok';
  end if;

  update public.email_codes set attempts = attempts + 1 where id = c.id;
  return case when c.attempts + 1 >= p_max_attempts then 'too_many' else 'invalid' end;
end;
$$;

-- Moves a guest's conversation, memories and usage onto an account when the
-- guest signs in with email, so nothing is lost.
create or replace function public.merge_user_data(p_from text, p_to text)
returns void
language sql
set search_path = public
as $$
  update public.messages set user_id = p_to where user_id = p_from;
  update public.memories set user_id = p_to where user_id = p_from;
  update public.usage_events set user_id = p_to where user_id = p_from;
$$;

-- "Forget everything" now also removes the account and its codes.
create or replace function public.delete_user_data(p_user_id text)
returns void
language sql
set search_path = public
as $$
  delete from public.memories where user_id = p_user_id;
  delete from public.messages where user_id = p_user_id;
  delete from public.email_codes where email = (select email from public.accounts where id = p_user_id);
  delete from public.accounts where id = p_user_id;
$$;

revoke execute on function public.consume_email_code from public, anon, authenticated;
revoke execute on function public.merge_user_data from public, anon, authenticated;
revoke execute on function public.delete_user_data from public, anon, authenticated;
