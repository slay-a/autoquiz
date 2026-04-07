-- Run this in Supabase SQL Editor after enabling the vector extension.
-- Dashboard → Database → Extensions → enable "vector"

-- ── Extensions ────────────────────────────────────────────────────────────────
create extension if not exists vector;

-- ── Processing Jobs ───────────────────────────────────────────────────────────
create table processing_jobs (
  job_id        text primary key,
  file_id       text not null,
  filename      text not null,
  status        text not null default 'queued',   -- queued | in_progress | success | failed
  stage         text,                              -- upload | extract | clean | section | chunk
  error_code    text,
  error_message text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger jobs_updated_at
  before update on processing_jobs
  for each row execute function update_updated_at();

-- ── Chunks (with pgvector embeddings) ─────────────────────────────────────────
create table chunks (
  chunk_id      text primary key,
  file_id       text not null,
  section_id    text,
  section_title text,
  page_numbers  int[],
  text          text not null,
  embedding     vector(1536),   -- text-embedding-3-small output dimension
  created_at    timestamptz default now()
);

-- Vector similarity search index (cosine)
create index on chunks using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Full-text search index for keyword search
create index on chunks using gin (to_tsvector('english', text));

-- ── Supabase RPC for vector search ───────────────────────────────────────────
create or replace function match_chunks(
  query_embedding vector(1536),
  match_count     int default 10,
  filter_file_id  text default null
)
returns table (
  chunk_id      text,
  file_id       text,
  text          text,
  section_title text,
  page_numbers  int[],
  similarity    float
)
language sql stable
as $$
  select
    chunk_id,
    file_id,
    text,
    section_title,
    page_numbers,
    1 - (embedding <=> query_embedding) as similarity
  from chunks
  where
    (filter_file_id is null or file_id = filter_file_id)
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ── Supabase Storage bucket (run once) ────────────────────────────────────────
-- Create via Dashboard → Storage → New Bucket → name: "uploads", private: true
-- Or uncomment below if using Supabase CLI:
-- insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false);
