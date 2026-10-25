-- Voice: log speech-to-text ('stt') and text-to-speech ('tts') costs alongside chats,
-- and report each visitor's own 24h spend for the per-user budget cap.

alter table public.usage_events drop constraint usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check
  check (kind in ('chat', 'session', 'stt', 'tts'));

drop function public.usage_summary(text, text);

create function public.usage_summary(p_user_id text, p_ip_hash text)
returns table (
  user_chats_last_minute int,
  user_chats_last_day int,
  ip_chats_last_day int,
  ip_sessions_last_day int,
  total_cost_last_day numeric,
  user_cost_last_day numeric
)
language sql stable
set search_path = public
as $$
  select
    count(*) filter (where kind = 'chat' and user_id = p_user_id and created_at > now() - interval '1 minute')::int,
    count(*) filter (where kind = 'chat' and user_id = p_user_id)::int,
    count(*) filter (where kind = 'chat' and ip_hash = p_ip_hash)::int,
    count(*) filter (where kind = 'session' and ip_hash = p_ip_hash)::int,
    coalesce(sum(cost_usd), 0),
    coalesce(sum(cost_usd) filter (where user_id = p_user_id), 0)
  from public.usage_events
  where created_at > now() - interval '1 day';
$$;

revoke execute on function public.usage_summary from public, anon, authenticated;
