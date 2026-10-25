-- Usage log behind the demo's rate limits and daily spend cap.
-- kind = 'chat' (one reply, with its estimated cost) or 'session' (a new visitor ID).
-- ip_hash is a keyed hash of the visitor's IP, never the IP itself.

create table public.usage_events (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('chat', 'session')),
  user_id text,
  ip_hash text not null,
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index usage_events_created_idx on public.usage_events (created_at);
create index usage_events_user_idx on public.usage_events (user_id, created_at);
create index usage_events_ip_idx on public.usage_events (ip_hash, created_at);

alter table public.usage_events enable row level security;

-- Everything the limit check needs, in one round trip.
create or replace function public.usage_summary(p_user_id text, p_ip_hash text)
returns table (
  user_chats_last_minute int,
  user_chats_last_day int,
  ip_chats_last_day int,
  ip_sessions_last_day int,
  total_cost_last_day numeric
)
language sql stable
set search_path = public
as $$
  select
    count(*) filter (where kind = 'chat' and user_id = p_user_id and created_at > now() - interval '1 minute')::int,
    count(*) filter (where kind = 'chat' and user_id = p_user_id)::int,
    count(*) filter (where kind = 'chat' and ip_hash = p_ip_hash)::int,
    count(*) filter (where kind = 'session' and ip_hash = p_ip_hash)::int,
    coalesce(sum(cost_usd), 0)
  from public.usage_events
  where created_at > now() - interval '1 day';
$$;

revoke execute on function public.usage_summary from public, anon, authenticated;

-- Wipes one visitor's data ("Forget everything").
create or replace function public.delete_user_data(p_user_id text)
returns void
language sql
set search_path = public
as $$
  delete from public.memories where user_id = p_user_id;
  delete from public.messages where user_id = p_user_id;
$$;

revoke execute on function public.delete_user_data from public, anon, authenticated;
