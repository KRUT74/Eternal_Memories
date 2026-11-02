-- Memory upgrade: a core profile that's always in mind, search by keyword as
-- well as meaning, and tidy-ups that merge and update memories over time.

-- 1. Richer memories --------------------------------------------------------

alter table public.memories
  -- Always included in every reply: key people, health, routines, home.
  add column is_core boolean not null default false,
  -- Set by the person (or a carer): always include, and tidy-ups never remove it.
  add column pinned boolean not null default false,
  add column category text not null default 'other'
    check (category in ('person', 'health', 'routine', 'place', 'preference', 'plan', 'other')),
  -- Who or what the memory is about, e.g. 'Leo' or 'Mixa'.
  add column subject text,
  add column updated_at timestamptz not null default now(),
  -- Tidy-ups retire memories instead of deleting them, so they can be restored
  -- for 30 days. Retired memories are never recalled or shown as stars.
  add column retired_at timestamptz,
  add column retired_reason text,
  -- Keyword search. 'english' drops words like "the" and "my" and matches
  -- "walks" with "walk"; names such as "Leo" or "Patel" match as written.
  add column content_tsv tsvector generated always as (to_tsvector('english', content)) stored;

create index memories_tsv_idx on public.memories using gin (content_tsv);
create index memories_core_idx on public.memories (user_id) where (is_core or pinned) and retired_at is null;

-- 2. Search by meaning and by keyword ----------------------------------------

-- Best memories for one person's message: the 40 closest by meaning and the 40
-- best keyword matches, merged by reciprocal rank fusion (a memory found both
-- ways rises to the top). Core and pinned memories are left out by default,
-- because the chat already includes all of them.
--
-- The meaning search scans only this person's memories, exactly. (Filtering
-- the shared HNSW index by person can silently return too few results once
-- there are many people.)
create or replace function public.search_memories(
  p_user_id text,
  query_embedding extensions.vector(384),
  query_text text,
  match_count int default 12,
  p_exclude_core boolean default true
)
returns table (
  id uuid,
  content text,
  similarity float,
  keyword_rank float,
  category text,
  subject text,
  created_at timestamptz
)
language sql stable
set search_path = public, extensions
as $$
  with mine as materialized (
    select m.id, m.embedding, m.content_tsv
    from public.memories m
    where m.user_id = p_user_id
      and m.retired_at is null
      and not (p_exclude_core and (m.is_core or m.pinned))
  ),
  by_meaning as (
    select mine.id,
      1 - (mine.embedding <=> query_embedding) as similarity,
      row_number() over (order by mine.embedding <=> query_embedding) as rank
    from mine
    order by mine.embedding <=> query_embedding
    limit 40
  ),
  -- Any of the message's words, not all of them.
  words as (
    select nullif(string_agg(quote_literal(lexeme), ' | '), '')::tsquery as query
    from unnest(to_tsvector('english', query_text))
  ),
  by_keyword as (
    select mine.id,
      ts_rank_cd(mine.content_tsv, words.query) as score,
      row_number() over (order by ts_rank_cd(mine.content_tsv, words.query) desc) as rank
    from mine, words
    where words.query is not null and mine.content_tsv @@ words.query
    order by score desc
    limit 40
  ),
  fused as (
    select coalesce(v.id, k.id) as id,
      coalesce(1.0 / (60 + v.rank), 0) + coalesce(1.0 / (60 + k.rank), 0) as score,
      v.similarity,
      k.score as keyword_rank
    from by_meaning v
    full outer join by_keyword k on k.id = v.id
  )
  select m.id, m.content,
    coalesce(f.similarity, 1 - (m.embedding <=> query_embedding)) as similarity,
    coalesce(f.keyword_rank, 0) as keyword_rank,
    m.category, m.subject, m.created_at
  from fused f
  join public.memories m on m.id = f.id
  order by f.score desc
  limit match_count;
$$;

-- The near-duplicate check when storing a memory ignores retired ones.
create or replace function public.match_memories(
  p_user_id text,
  query_embedding extensions.vector(384),
  match_count int default 5,
  min_similarity float default 0.5
)
returns table (id uuid, content text, similarity float, created_at timestamptz)
language sql stable
set search_path = public, extensions
as $$
  select m.id, m.content, 1 - (m.embedding <=> query_embedding) as similarity, m.created_at
  from public.memories m
  where m.user_id = p_user_id
    and m.retired_at is null
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

-- 3. Tidy-ups ----------------------------------------------------------------

-- One row per tidy-up: what it changed (shown in the app) and what it cost.
create table public.memory_tidy_runs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  memories_before int not null,
  merged int not null default 0,
  updated int not null default 0,
  retired int not null default 0,
  core_changed int not null default 0,
  -- [{ "op": "merge" | "update" | "retire" | "core", "before": [...], "after": "...", "reason": "..." }]
  changes jsonb not null default '[]',
  cost_usd numeric(10, 6) not null default 0,
  created_at timestamptz not null default now()
);

create index memory_tidy_runs_user_idx on public.memory_tidy_runs (user_id, created_at desc);
alter table public.memory_tidy_runs enable row level security;

alter table public.usage_events drop constraint usage_events_kind_check;
alter table public.usage_events add constraint usage_events_kind_check
  check (kind in ('chat', 'session', 'stt', 'tts', 'tidy'));

-- Guests who sign in with email bring their tidy-up history along.
create or replace function public.merge_user_data(p_from text, p_to text)
returns void
language sql
set search_path = public
as $$
  update public.messages set user_id = p_to where user_id = p_from;
  update public.memories set user_id = p_to where user_id = p_from;
  update public.usage_events set user_id = p_to where user_id = p_from;
  update public.memory_tidy_runs set user_id = p_to where user_id = p_from;
$$;

-- "Forget everything" also removes tidy-up history (and, via the account,
-- face sign-in passkeys).
create or replace function public.delete_user_data(p_user_id text)
returns void
language sql
set search_path = public
as $$
  delete from public.memories where user_id = p_user_id;
  delete from public.messages where user_id = p_user_id;
  delete from public.memory_tidy_runs where user_id = p_user_id;
  delete from public.email_codes where email = (select email from public.accounts where id = p_user_id);
  delete from public.accounts where id = p_user_id;
$$;

revoke execute on function public.search_memories from public, anon, authenticated;
revoke execute on function public.match_memories from public, anon, authenticated;
revoke execute on function public.merge_user_data from public, anon, authenticated;
revoke execute on function public.delete_user_data from public, anon, authenticated;
