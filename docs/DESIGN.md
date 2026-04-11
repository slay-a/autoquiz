# AutoQuiz — System Design Document

> **Purpose:** Single source of truth for system architecture, data model, API contracts,
> and security constraints. `autoquiz-design-validator` reads this file as its reference
> when judging whether an implementation follows intended design. `autoquiz-req-validator`
> reads the API Contracts section to verify request/response shapes.
>
> **Maintained by:** product owner. Update this file before implementing changes that alter
> architecture, schema, or API contracts — not after.

---

## 0. Architectural Pattern

> This section is the highest-priority reference for `autoquiz-design-validator`.
> Any implementation that violates the layer boundaries or component rules below
> must be flagged as **CRITICAL** regardless of whether the feature otherwise works.

### Backend — Strict Layered Architecture

The backend is organized into four layers. **Data flows downward only.** Upper layers
call lower layers; lower layers never import from upper layers.

```
┌─────────────────────────────────────────────────┐
│  Layer 1 — API / Presentation                   │
│  backend/app/api/routes/                        │
│  Responsibility: HTTP routing, input validation, │
│  response shaping. Delegates all logic to Layer 2│
│  Rules:                                         │
│  - No direct DB or OpenAI calls                 │
│  - No business logic                            │
│  - Reads/writes only via service functions      │
└───────────────────┬─────────────────────────────┘
                    │ calls
┌───────────────────▼─────────────────────────────┐
│  Layer 2 — Service / Business Logic             │
│  backend/app/services/                          │
│  Responsibility: RAG pipeline, LLM orchestration,│
│  document processing, retrieval logic.          │
│  Rules:                                         │
│  - All OpenAI calls live here, nowhere else     │
│  - No HTTP request/response objects             │
│  - No FastAPI imports                           │
└───────────────────┬─────────────────────────────┘
                    │ calls
┌───────────────────▼─────────────────────────────┐
│  Layer 3 — Infrastructure                       │
│  backend/app/core/   backend/app/utils/         │
│  Responsibility: External client initialization  │
│  (Supabase, OpenAI), config loading, file        │
│  parsers, pure helpers.                         │
│  Rules:                                         │
│  - No business logic                            │
│  - No route-level concerns                      │
└───────────────────┬─────────────────────────────┘
                    │ reads/writes
┌───────────────────▼─────────────────────────────┐
│  Layer 4 — Data                                 │
│  Supabase Postgres + pgvector                   │
│  Supabase Storage (bucket: "uploads")           │
│  Schemas defined in: backend/app/models/schemas.py │
│  (Pydantic) and backend/supabase_schema.sql (SQL)│
└─────────────────────────────────────────────────┘

Async boundary: long-running Layer 2 work (ingestion) is
offloaded to Celery + Redis — never called inline from Layer 1.
```

**Layer violation examples the design-validator must flag as CRITICAL:**
- A route handler imports `openai` or calls `supabase` directly
- A service function imports from `app.api`
- Business logic (prompt building, chunk filtering) placed in a route handler
- A Celery task bypassing Layer 2 and writing to the DB directly from a parser

---

### Frontend — Component-Based Architecture with Context State

The frontend is not MVC. It uses a **component-based architecture** where pages own their
local state and data fetching, a single Context provides global auth state, and reusable
components are purely presentational.

```
┌─────────────────────────────────────────────────┐
│  Global State Layer                             │
│  frontend/src/contexts/AuthContext.jsx          │
│  Responsibility: user identity, profile, role,  │
│  login/logout. The only global state in the app.│
│  Rules:                                         │
│  - Only one context exists (AuthContext)        │
│  - New global state requires explicit           │
│    justification — default to local state       │
└───────────────────┬─────────────────────────────┘
                    │ consumed via useAuth()
┌───────────────────▼─────────────────────────────┐
│  Page Layer (Smart Containers)                  │
│  frontend/src/pages/                            │
│  Organized by role: instructor/ and student/    │
│  Shared pages at root of pages/                 │
│  Responsibility: data fetching, local state,    │
│  composition of reusable components.            │
│  Rules:                                         │
│  - One page per route                           │
│  - Pages call the FastAPI backend directly      │
│    (fetch/axios) — not Supabase tables          │
│  - Role-gated pages wrapped in ProtectedRoute   │
└───────────────────┬─────────────────────────────┘
                    │ renders
┌───────────────────▼─────────────────────────────┐
│  Component Layer (Reusable / Presentational)    │
│  frontend/src/components/                       │
│  Current components: ProtectedRoute, QuizView,  │
│  Upload, TopicSearch                            │
│  Rules:                                         │
│  - No direct API calls (receive data via props) │
│  - No business logic                            │
│  - May use useAuth() for identity display only  │
└───────────────────┬─────────────────────────────┘
                    │ uses
┌───────────────────▼─────────────────────────────┐
│  Library / Utility Layer                        │
│  frontend/src/lib/                              │
│  supabase.js — Supabase JS client (auth only)   │
│  sharing.js   — pure helper functions           │
│  Rules:                                         │
│  - No React imports                             │
│  - No component rendering                       │
│  - supabase.js used for auth operations only;   │
│    never for direct table queries from pages    │
└─────────────────────────────────────────────────┘
```

**Layer violation examples the design-validator must flag as CRITICAL:**
- A component making a `fetch()` call to the backend
- A page querying Supabase tables directly (instead of calling the FastAPI backend)
- A second Context created without justification
- Business logic (score calculation, prompt building) placed in a page or component

---

### What this architecture is NOT

| Pattern | Why it does not apply |
|---|---|
| MVC | No dedicated controller layer; no server-rendered views |
| Repository pattern | Services call Supabase client directly — no repository abstraction |
| Flux / Redux | Global state is confined to AuthContext; no action/reducer pattern |
| Microservices | Single FastAPI process; Celery is a worker, not a separate service |

---

## 1. System Overview

AutoQuiz is a two-role (instructor / student) web application for AI-powered quiz and
study material generation from uploaded course documents.

```
Browser (React/Vite)
      │  HTTPS
      ▼
FastAPI backend (Python)          ← handles all API requests
      │
      ├── Supabase Postgres       ← primary data store + pgvector
      │     └── Supabase Storage  ← raw uploaded files (bucket: "uploads")
      │
      ├── Celery + Redis          ← async document processing pipeline
      │
      └── OpenAI API
            ├── text-embedding-3-small   ← chunk embeddings
            └── GPT-4o                   ← quiz generation, notes generation
```

**Frontend origin:** `http://localhost:5173` (dev). CORS is explicitly allowlisted; no
wildcard origins.

---

## 2. Authentication & Role Model

Authentication is handled entirely by **Supabase Auth**. The backend does not issue or
validate JWT tokens itself.

### Roles

| Role         | Set at       | Source of truth                   |
|--------------|--------------|-----------------------------------|
| `instructor` | Registration | `profiles.role` column            |
| `student`    | Registration | `profiles.role` column            |

- Role is set once at signup via `raw_user_meta_data.role` and stored in `profiles`.
- Role changes require a direct DB update — there is no self-service role upgrade.

### Frontend auth state

`AuthContext` (`frontend/src/contexts/AuthContext.jsx`) is the single source of auth
state for all components. Rules for using it:

- All protected pages must call `useAuth()` and check `profile.role`.
- Never read role from `localStorage` directly in components — always via `AuthContext`.
- `profile.role` is available synchronously after the initial load phase (`loading === false`).

### Backend auth

The backend currently uses **Supabase service key** (`supabase_service_key`) for all DB
operations — it bypasses RLS. This is a known gap (see Section 9). Route-level auth
enforcement is therefore the responsibility of each route handler until RLS is tightened.

---

## 3. Database Schema

All tables are in the Supabase Postgres instance. Source of truth: `backend/supabase_schema.sql`.

### Tables

#### `profiles`
| Column       | Type        | Notes                                      |
|--------------|-------------|--------------------------------------------|
| `id`         | uuid (PK)   | References `auth.users(id)`                |
| `email`      | text        |                                            |
| `full_name`  | text        |                                            |
| `role`       | text        | `CHECK (role IN ('instructor', 'student'))` |
| `created_at` | timestamptz |                                            |

Auto-populated by `handle_new_user()` trigger on `auth.users` insert.

#### `classes`
| Column          | Type        | Notes                              |
|-----------------|-------------|------------------------------------|
| `id`            | uuid (PK)   |                                    |
| `name`          | text        |                                    |
| `description`   | text        | nullable                           |
| `class_code`    | text        | unique; used for student join      |
| `instructor_id` | uuid (FK)   | → `profiles(id)` ON DELETE CASCADE |
| `created_at`    | timestamptz |                                    |

#### `class_members`
| Column       | Type        | Notes                              |
|--------------|-------------|------------------------------------|
| `class_id`   | uuid (FK)   | → `classes(id)` ON DELETE CASCADE  |
| `student_id` | uuid (FK)   | → `profiles(id)` ON DELETE CASCADE |
| `joined_at`  | timestamptz |                                    |
| PK           | composite   | `(class_id, student_id)`           |

#### `uploaded_files`
| Column        | Type        | Notes                              |
|---------------|-------------|------------------------------------|
| `file_id`     | text (PK)   | UUID string                        |
| `filename`    | text        |                                    |
| `uploaded_by` | uuid (FK)   | → `profiles(id)`                   |
| `class_id`    | uuid (FK)   | → `classes(id)`; nullable          |
| `created_at`  | timestamptz |                                    |

#### `processing_jobs`
| Column          | Type        | Notes                                           |
|-----------------|-------------|-------------------------------------------------|
| `job_id`        | text (PK)   |                                                 |
| `file_id`       | text        |                                                 |
| `filename`      | text        |                                                 |
| `status`        | text        | `queued` \| `in_progress` \| `success` \| `failed` |
| `stage`         | text        | `upload` \| `extract` \| `clean` \| `section` \| `chunk` |
| `error_code`    | text        | nullable                                        |
| `error_message` | text        | nullable                                        |
| `uploaded_by`   | uuid (FK)   | → `profiles(id)`                                |
| `created_at`    | timestamptz |                                                 |
| `updated_at`    | timestamptz | auto-updated by `jobs_updated_at` trigger        |

#### `chunks`
| Column          | Type          | Notes                                      |
|-----------------|---------------|--------------------------------------------|
| `chunk_id`      | text (PK)     |                                            |
| `file_id`       | text          | references `uploaded_files.file_id`        |
| `section_id`    | text          | nullable                                   |
| `section_title` | text          | nullable                                   |
| `page_numbers`  | int[]         |                                            |
| `text`          | text          |                                            |
| `embedding`     | vector(1536)  | `text-embedding-3-small` output            |
| `created_at`    | timestamptz   |                                            |

Indexes: `ivfflat` on `embedding` (cosine ops, 100 lists); `gin` on `text` (full-text search).

#### `saved_quizzes`
| Column            | Type        | Notes                                             |
|-------------------|-------------|---------------------------------------------------|
| `id`              | uuid (PK)   |                                                   |
| `title`           | text        |                                                   |
| `topic`           | text        |                                                   |
| `difficulty`      | text        | `easy` \| `medium` \| `hard`; default `medium`   |
| `file_id`         | text        | nullable                                          |
| `created_by`      | uuid (FK)   | → `profiles(id)` ON DELETE CASCADE                |
| `class_id`        | uuid (FK)   | → `classes(id)` ON DELETE SET NULL; nullable      |
| `is_shared`       | boolean     | default `false`; instructor-toggled               |
| `outside_sources` | boolean     | default `false`                                   |
| `questions`       | jsonb        | array of question objects (see schema below)      |
| `created_at`      | timestamptz |                                                   |

`questions` jsonb shape:
```json
[{
  "question_id": "string",
  "type": "mcq | true_false | short_answer",
  "question": "string",
  "options": [{"label": "A", "text": "..."}],
  "answer": "string",
  "explanation": "string",
  "source_chunk_ids": ["string"],
  "page_numbers": [1, 2]
}]
```

#### `flashcard_sets`
| Column       | Type        | Notes                                        |
|--------------|-------------|----------------------------------------------|
| `id`         | uuid (PK)   |                                              |
| `title`      | text        |                                              |
| `quiz_id`    | uuid (FK)   | → `saved_quizzes(id)` ON DELETE SET NULL     |
| `created_by` | uuid (FK)   | → `profiles(id)` ON DELETE CASCADE           |
| `class_id`   | uuid (FK)   | → `classes(id)` ON DELETE SET NULL; nullable |
| `is_shared`  | boolean     | default `false`                              |
| `is_public`  | boolean     | default `false`                              |
| `share_code` | text        | nullable; random code for public access      |
| `set_type`   | text        | `all` \| `wrong` \| `custom`                |
| `cards`      | jsonb       | `[{front, back, source_page}]`               |
| `created_at` | timestamptz |                                              |

#### `class_notes`
| Column         | Type        | Notes                                        |
|----------------|-------------|----------------------------------------------|
| `id`           | uuid (PK)   |                                              |
| `class_id`     | uuid (FK)   | → `classes(id)` ON DELETE CASCADE            |
| `created_by`   | uuid (FK)   | → `profiles(id)` ON DELETE CASCADE           |
| `title`        | text        |                                              |
| `topic`        | text        |                                              |
| `file_id`      | text        | nullable                                     |
| `content`      | jsonb       | structured notes object (summary, concepts…) |
| `is_published` | boolean     | default `false`                              |
| `created_at`   | timestamptz |                                              |
| `updated_at`   | timestamptz | auto-updated by `notes_updated_at` trigger   |

### RLS posture

RLS is **enabled on all tables** but current policies use `auth_all` (full access for any
authenticated user). This is a known temporary state — tighten to owner-scoped policies
before production. The design-validator should flag any new feature that adds sensitive
data without a corresponding RLS policy tightening plan.

---

## 4. API Contracts

Base URL: `http://localhost:8000` (dev). All routes return JSON.
Auth: currently unenforced at route level (service key bypasses RLS). Add a
`get_current_user` dependency to any route that must be role-gated.

### Upload

| Method | Path                        | Request body          | Success response              | Error codes |
|--------|-----------------------------|-----------------------|-------------------------------|-------------|
| POST   | `/upload/`                  | `multipart/form-data` `file` | `UploadResponse` (201)  | 400 bad ext, 413 too large |
| GET    | `/upload/status/{job_id}`   | —                     | `JobStatusResponse` (200)     | 404 job not found |

**`UploadResponse`:**
```json
{ "file_id": "uuid", "job_id": "uuid", "status": "queued", "message": "string" }
```

**`JobStatusResponse`:**
```json
{
  "job_id": "string", "file_id": "string",
  "status": "queued|in_progress|success|failed",
  "stage": "upload|extract|clean|section|chunk|null",
  "error_code": "string|null", "error_message": "string|null",
  "created_at": "ISO8601", "updated_at": "ISO8601"
}
```

### Retrieval

| Method | Path         | Request body       | Success response     | Error codes |
|--------|--------------|--------------------|----------------------|-------------|
| POST   | `/retrieve/` | `RetrieveRequest`  | `RetrieveResponse`   | 400 empty topic |

**`RetrieveRequest`:**
```json
{ "topic": "string", "file_id": "string|null", "top_k": 10 }
```

### Quiz

| Method | Path              | Request body  | Success response | Error codes |
|--------|-------------------|---------------|------------------|-------------|
| POST   | `/quiz/generate`  | `QuizRequest` | `QuizResponse`   | 400 empty topic, 404 no content found |

**`QuizRequest`:**
```json
{
  "topic": "string",
  "file_id": "string|null",
  "num_questions": 5,
  "difficulty": "easy|medium|hard",
  "question_types": ["mcq", "true_false", "short_answer"],
  "outside_sources": false
}
```

**`QuizResponse`:**
```json
{
  "quiz_id": "uuid",
  "topic": "string",
  "difficulty": "string",
  "questions": [QuizQuestion]
}
```

### Notes

| Method | Path               | Request body   | Success response | Error codes |
|--------|--------------------|----------------|------------------|-------------|
| POST   | `/notes/generate`  | `NotesRequest` | notes object     | —           |

**`NotesRequest`:**
```json
{ "topic": "string", "file_id": "string|null", "outside_sources": false }
```

---

## 5. RAG Pipeline

The pipeline runs in three phases. Each phase maps to a service file.

```
Phase 1 — Ingestion (async, Celery)          backend/app/services/ingestion.py
  File upload → Supabase Storage
  → parse (PDF/DOCX/PPTX)                    backend/app/utils/parsers.py
  → clean (remove headers/footers)
  → detect sections
  → chunk (target: chunk_size_tokens=400, overlap=60)
  → embed (text-embedding-3-small)
  → store chunks + embeddings in pgvector

Phase 2 — Retrieval (sync, per-request)      backend/app/services/retrieval.py
  embed query → vector search (match_chunks RPC, top_k=10)
  fallback: keyword search if file not yet embedded
  MAX_CONTEXT_CHARS = 80,000 (hard limit on context passed to LLM)

Phase 3 — Generation (sync, per-request)     backend/app/services/quiz_gen.py
  build prompt (topic + difficulty + question_types + context chunks)
  → GPT-4o with JSON-only system prompt
  → parse structured response → QuizQuestion list
```

### Design rules for the RAG pipeline

1. **All OpenAI calls live in `services/`** — never in route handlers.
2. **Prompt construction uses pre-written fragments**, not raw f-string interpolation of
   user input, for any LLM-facing string. Map user-controlled values (e.g., difficulty)
   to a dict of pre-written strings before injecting into the prompt.
3. **Context window guard:** never pass more than `MAX_CONTEXT_CHARS` to the LLM.
   Truncate or filter chunks before building the prompt, not after.
4. **Ingestion is always async (Celery).** Never call ingestion logic from a FastAPI
   route handler synchronously — it blocks the event loop.
5. **Retrieval is sync** and fast enough for a request/response cycle. Do not move it
   to Celery unless profiling shows a problem.

---

## 6. Frontend Architecture

### Directory structure

```
frontend/src/
  contexts/
    AuthContext.jsx          ← single auth state provider; wrap entire app
  pages/
    instructor/
      Dashboard.jsx          ← class list, create class
      ClassView.jsx          ← class detail: members, files, notes, quizzes
    student/
      Dashboard.jsx          ← joined classes, recent activity
      Generate.jsx           ← quiz generation (student self-serve)
    Login.jsx
    Register.jsx
    Notes.jsx
    QuizStudy.jsx
    StudentQuiz.jsx
    ClassNoteView.jsx
    FlashcardEditor.jsx
    FlashcardStudy.jsx
```

### Design rules for the frontend

1. **No secrets in client-side code.** API keys, service keys, and credentials must never
   appear in any `.jsx`, `.js`, or `.ts` file. Use Vite env vars (`VITE_*`) for public
   config only (Supabase URL and anon key are safe; service key is not).
2. **Auth state flows only through `AuthContext`.** Components must not read role or user
   ID from `localStorage` directly.
3. **Role-based routing:** instructor pages must check `profile.role === 'instructor'`
   via `useAuth()`. Redirect students who navigate to instructor URLs.
4. **Local state for ephemeral UI.** Use `useState` for form state, selections, and
   one-request results. Only lift to context if state is needed across unrelated routes.
5. **API calls go to the FastAPI backend**, not directly to Supabase (except auth
   operations, which use the Supabase JS client).

---

## 7. Async Architecture

| Concern            | Runtime        | Notes                                    |
|--------------------|----------------|------------------------------------------|
| HTTP request handling | FastAPI (async) | `async def` route handlers            |
| Document ingestion | Celery + Redis | Never block FastAPI with ingestion work  |
| Quiz/notes generation | FastAPI (sync inside async route) | OpenAI calls are blocking; acceptable for now |
| DB queries         | Supabase Python client (sync) | Wrapped in `run_in_executor` if needed |

**Rule:** anything that takes >500ms should be a Celery task, not an inline route call.
Current exception: GPT-4o calls in quiz and notes routes (acceptable until load testing
shows a problem).

---

## 8. Configuration

All config is loaded from `.env` via `backend/app/core/config.py` (Pydantic `BaseSettings`).

| Variable               | Default              | Purpose                            |
|------------------------|----------------------|------------------------------------|
| `OPENAI_API_KEY`       | —                    | Required                           |
| `SUPABASE_URL`         | —                    | Required                           |
| `SUPABASE_SERVICE_KEY` | —                    | Required (bypasses RLS)            |
| `SUPABASE_DB_URL`      | —                    | Direct Postgres connection         |
| `REDIS_URL`            | `redis://localhost:6379/0` | Celery broker              |
| `MAX_UPLOAD_SIZE_MB`   | `50`                 | Enforced in upload route           |
| `CHUNK_SIZE_TOKENS`    | `400`                | Ingestion chunking                 |
| `CHUNK_OVERLAP_TOKENS` | `60`                 | Ingestion chunking                 |
| `TOP_K_RESULTS`        | `10`                 | Default retrieval count            |

---

## 9. Known Gaps & Constraints

These are documented architectural debts. Agents should be aware of them but must not
fix them unless a feature spec explicitly targets them.

| ID    | Gap                                             | Impact                                          |
|-------|-------------------------------------------------|-------------------------------------------------|
| GAP-1 | RLS policies are permissive (`auth_all`)        | Any authenticated user can read/write any row   |
| GAP-2 | No `get_current_user` dependency on routes      | Role enforcement is manual per-handler, not middleware-level |
| GAP-3 | GPT-4o calls are synchronous in async routes    | Under load, this will exhaust the FastAPI worker pool |
| GAP-4 | `difficulty` f-string injection in `quiz_gen.py` | Normalizes user-data-in-prompt; fix with dict mapping |
| GAP-5 | No test suite yet (`backend/tests/` absent)     | Tester agent must create the directory          |
| GAP-6 | CORS `allow_origins` is hardcoded               | Will need env var for production deployment     |

---

## 10. Security Constraints

These are non-negotiable. The design-validator will flag any violation as CRITICAL.

1. **No SQL string concatenation.** All DB queries use the Supabase client's parameterized methods.
2. **No user input injected raw into LLM prompts.** All user-controlled values must pass through a pre-written mapping dict before entering a prompt string.
3. **No API keys in frontend source.** `SUPABASE_SERVICE_KEY` must never appear in Vite env vars or frontend code.
4. **File type validation is extension + MIME.** Allowed: `.pdf`, `.docx`, `.pptx`. Reject all others at the upload route boundary.
5. **Max upload size enforced before reading full file into memory.** Currently: 50MB.
6. **CORS is explicit allowlist only.** No `allow_origins=["*"]`.
