-- ─────────────────────────────────────────────────────────────
-- AutoQuiz — Full Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────

-- 1. Extensions
create extension if not exists vector;

-- ─── 2. Profiles ──────────────────────────────────────────────
create table if not exists profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  email       text not null,
  full_name   text not null,
  role        text not null check (role in ('instructor', 'student')),
  created_at  timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    coalesce(new.raw_user_meta_data->>'role', 'student')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ─── 3. Classes ───────────────────────────────────────────────
create table if not exists classes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  class_code    text unique not null,
  instructor_id uuid references profiles(id) on delete cascade not null,
  created_at    timestamptz default now()
);

-- ─── 4. Class Members ─────────────────────────────────────────
create table if not exists class_members (
  class_id    uuid references classes(id) on delete cascade,
  student_id  uuid references profiles(id) on delete cascade,
  joined_at   timestamptz default now(),
  primary key (class_id, student_id)
);

-- ─── 5. Uploaded Files ────────────────────────────────────────
create table if not exists uploaded_files (
  file_id       text primary key,
  filename      text not null,
  uploaded_by   uuid references profiles(id),
  class_id      uuid references classes(id),
  created_at    timestamptz default now()
);

-- ─── 6. Processing Jobs ───────────────────────────────────────
create table if not exists processing_jobs (
  job_id        text primary key,
  file_id       text not null,
  filename      text not null,
  status        text not null default 'queued',
  stage         text,
  error_code    text,
  error_message text,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists jobs_updated_at on processing_jobs;
create trigger jobs_updated_at
  before update on processing_jobs
  for each row execute function update_updated_at();

-- ─── 7. Chunks + Vector Store ─────────────────────────────────
create table if not exists chunks (
  chunk_id      text primary key,
  file_id       text not null,
  section_id    text,
  section_title text,
  page_numbers  int[],
  text          text not null,
  embedding     vector(1536),
  created_at    timestamptz default now()
);

create index if not exists chunks_embedding_idx
  on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists chunks_fts_idx
  on chunks using gin (to_tsvector('english', text));

create or replace function match_chunks(
  query_embedding vector(1536),
  match_count     int     default 10,
  filter_file_id  text    default null
)
returns table (
  chunk_id      text, file_id text, text text,
  section_title text, page_numbers int[], similarity float
)
language sql stable as $$
  select chunk_id, file_id, text, section_title, page_numbers,
         1 - (embedding <=> query_embedding) as similarity
  from chunks
  where filter_file_id is null or file_id = filter_file_id
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- ─── 8. Saved Quizzes ─────────────────────────────────────────
create table if not exists saved_quizzes (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  topic           text not null,
  difficulty      text not null default 'medium',
  file_id         text,
  created_by      uuid references profiles(id) on delete cascade not null,
  class_id        uuid references classes(id) on delete set null,
  is_shared       boolean default false,
  outside_sources boolean default false,
  questions       jsonb not null,
  created_at      timestamptz default now()
);

-- ─── 9. Flashcard Sets ────────────────────────────────────────
create table if not exists flashcard_sets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  quiz_id     uuid references saved_quizzes(id) on delete set null,
  created_by  uuid references profiles(id) on delete cascade not null,
  class_id    uuid references classes(id) on delete set null,
  is_shared   boolean default false,
  is_public   boolean default false,
  share_code  text,
  set_type    text,             -- 'all' | 'wrong' | 'custom'
  cards       jsonb not null,  -- [{front, back, source_page}]
  created_at  timestamptz default now()
);

-- ─── 10. Class Notes ─────────────────────────────────────────
create table if not exists class_notes (
  id           uuid primary key default gen_random_uuid(),
  class_id     uuid references classes(id) on delete cascade not null,
  created_by   uuid references profiles(id) on delete cascade not null,
  title        text not null,
  topic        text not null,
  file_id      text,
  content      jsonb not null,
  is_published boolean default false,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

drop trigger if exists notes_updated_at on class_notes;
create trigger notes_updated_at
  before update on class_notes
  for each row execute function update_updated_at();

-- ─── 11. RLS (permissive for now — tighten per-column later) ──
alter table profiles        enable row level security;
alter table classes         enable row level security;
alter table class_members   enable row level security;
alter table saved_quizzes   enable row level security;
alter table flashcard_sets  enable row level security;
alter table uploaded_files  enable row level security;
alter table processing_jobs enable row level security;
alter table chunks          enable row level security;
alter table class_notes     enable row level security;

-- Allow authenticated users full access (tighten to owner-only later)
do $$ begin
  if not exists (select 1 from pg_policies where tablename='profiles' and policyname='auth_all') then
    create policy auth_all on profiles for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='classes' and policyname='auth_all') then
    create policy auth_all on classes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='class_members' and policyname='auth_all') then
    create policy auth_all on class_members for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='saved_quizzes' and policyname='auth_all') then
    create policy auth_all on saved_quizzes for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='flashcard_sets' and policyname='auth_all') then
    create policy auth_all on flashcard_sets for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='uploaded_files' and policyname='auth_all') then
    create policy auth_all on uploaded_files for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='processing_jobs' and policyname='auth_all') then
    create policy auth_all on processing_jobs for all to authenticated using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where tablename='chunks' and policyname='auth_all') then
    create policy auth_all on chunks for all to authenticated using (true) with check (true);
  end if;
end $$;

-- ─── Migration: FEAT-010 — Harden class_notes RLS ────────────
-- Replace permissive policy with ownership/publishing access control
drop policy if exists auth_all on class_notes;

-- SELECT: users can read notes they created OR that are published
create policy class_notes_select on class_notes
  for select to authenticated
  using (created_by = auth.uid() or is_published = true);

-- INSERT: only note owner
create policy class_notes_insert on class_notes
  for insert to authenticated
  with check (created_by = auth.uid());

-- UPDATE: only note owner
create policy class_notes_update on class_notes
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- DELETE: only note owner
create policy class_notes_delete on class_notes
  for delete to authenticated
  using (created_by = auth.uid());

-- ─── 11. Storage bucket (run once) ───────────────────────────
-- Dashboard → Storage → New Bucket → name: "uploads" → private

-- ─── 12. Migration: FEAT-007 — Harden saved_quizzes RLS ──────
-- Replace permissive policy with ownership/sharing access control
drop policy if exists auth_all on saved_quizzes;

-- SELECT: users can read quizzes they created OR that are shared
create policy saved_quizzes_select on saved_quizzes
  for select to authenticated
  using (created_by = auth.uid() OR is_shared = true);

-- INSERT/UPDATE/DELETE: only quiz owner
create policy saved_quizzes_insert on saved_quizzes
  for insert to authenticated
  with check (created_by = auth.uid());

create policy saved_quizzes_update on saved_quizzes
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

create policy saved_quizzes_delete on saved_quizzes
  for delete to authenticated
  using (created_by = auth.uid());

-- ─── Migration: FEAT-009 — Student Notes ─────────────────────
create table if not exists student_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  topic text not null,
  file_id text references uploaded_files(file_id) on delete set null,
  created_by uuid not null references profiles(id) on delete cascade,
  content jsonb not null,
  created_at timestamptz not null default now()
);

alter table student_notes enable row level security;

create policy students_own_notes on student_notes
  for all using (created_by = auth.uid())
  with check (created_by = auth.uid());
