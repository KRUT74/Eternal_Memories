-- Long-term memory for Eternal Memories AI.
-- Only the Next.js server (using the secret key) touches these tables, so RLS is
-- enabled with no policies: the public/publishable key can read or write nothing.

create extension if not exists vector with schema extensions;

-- Full chat transcript, one row per message.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index messages_user_created_idx on public.messages (user_id, created_at);

-- Durable facts Claude extracts from conversations ("Their daughter is called Mia").
-- 384 dimensions = Supabase's built-in gte-small embedding model.
create table public.memories (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  content text not null,
  embedding extensions.vector(384) not null,
  source_message_id uuid references public.messages (id) on delete set null,
  created_at timestamptz not null default now()
);

create index memories_user_idx on public.memories (user_id);
create index memories_embedding_idx on public.memories
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.messages enable row level security;
alter table public.memories enable row level security;

-- Closest memories for one user, by cosine similarity.
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
    and 1 - (m.embedding <=> query_embedding) >= min_similarity
  order by m.embedding <=> query_embedding
  limit match_count;
$$;

revoke execute on function public.match_memories from public, anon, authenticated;
