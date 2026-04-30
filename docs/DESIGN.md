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
│  (Supabase, OpenAI), config loading, LlamaIndex  │
│  document readers + splitters, pure helpers.    │
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

### Cross-Layer Call Contracts

Each arrow between layers is a contract. Contracts live in this document — the
code implements them.

1. **Signatures first.** Any function crossing a layer boundary has a typed
   signature recorded in this document or the relevant feature spec before
   implementation starts. Changing a signature is a DESIGN.md edit first, code
   edit second.
2. **No skipping layers.** Routes call services; services call infra; infra
   reads/writes data. Any call that skips a layer (e.g. a route importing
   `app.core.supabase` directly, or a Celery task writing to the DB without
   going through a service) is a **CRITICAL** violation.
3. **No upward imports.** Files in Layer 2, 3, or 4 never import from a higher
   layer. `services/` never imports from `api/`; `core/` never imports from
   `services/`. Enforced by grep in CI.
4. **Errors cross boundaries as typed exceptions.** Services raise from the
   hierarchy in §3.1. Routes translate to HTTP via the registry in §3.1.2.
   Bare `except Exception` at a layer boundary is **MAJOR**.
5. **No FastAPI primitives below Layer 1.** `Request`, `Response`, `Depends`,
   and `HTTPException` are Layer 1 only. A service or util that imports from
   `fastapi` is a **CRITICAL** violation.
6. **Frontend mirror.** Pages fetch; components render. A component that
   imports `fetch`, `axios`, or the Supabase client (beyond auth reads) is a
   **CRITICAL** layer violation.
7. **One context, one concern.** `AuthContext` owns identity and nothing else.
   `ThemeContext` owns theme and nothing else. New global state requires the
   spec to state why local state is insufficient; unjustified new contexts are
   **MAJOR**.
8. **Celery tasks are services with a queue in front.** A task body must call
   service functions, not reach into `app.core` or raw SQL directly. Task
   modules live at `backend/app/tasks/` (or the existing `celery_worker.py`),
   never inside `routes/`.

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

## 2. Naming Conventions

Consistent naming is enforced across all layers. The design-validator must flag violations
as **WARNING** unless they cross a security or architecture boundary, in which case **CRITICAL**.

### 2.1 Python (Backend)

| Construct | Convention | Example |
|---|---|---|
| Modules / files | `snake_case` | `quiz_gen.py`, `ingestion.py` |
| Packages / directories | `snake_case` | `app/services/`, `app/utils/` |
| Functions and methods | `snake_case` | `generate_quiz()`, `embed_chunks()` |
| Variables | `snake_case` | `file_id`, `chunk_overlap` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_CONTEXT_CHARS`, `CHUNK_SIZE_TOKENS` |
| Classes | `PascalCase` | `QuizRequest`, `JobStatusResponse` |
| Pydantic models | `PascalCase`, suffix with request type | `QuizRequest`, `NotesRequest`, `UploadResponse` |
| Celery tasks | `snake_case`, prefixed with `task_` | `task_ingest_file()` |
| Private helpers | `_snake_case` (leading underscore) | `_build_prompt()`, `_truncate_context()` |
| Type aliases | `PascalCase` | `ChunkList`, `QuestionDict` |

**Additional rules:**
- Boolean variables and function return values use `is_`, `has_`, or `can_` prefixes: `is_shared`, `has_embedding`, `can_retry`.
- Route handler functions are named after the HTTP action + resource: `upload_file`, `get_job_status`, `generate_quiz`.
- Async functions are not prefixed with `async_` — the `async def` signature is sufficient.

### 2.2 JavaScript / JSX (Frontend)

| Construct | Convention | Example |
|---|---|---|
| Files — React components | `PascalCase.jsx` | `QuizView.jsx`, `FlashcardEditor.jsx` |
| Files — utilities / lib | `camelCase.js` | `sharing.js`, `supabase.js` |
| React components | `PascalCase` | `QuizView`, `ProtectedRoute` |
| Custom hooks | `camelCase`, prefixed with `use` | `useAuth()`, `useQuizState()` |
| Regular functions | `camelCase` | `formatDate()`, `buildQueryParams()` |
| Variables | `camelCase` | `fileId`, `quizData`, `isLoading` |
| Constants (module-level) | `UPPER_SNAKE_CASE` | `API_BASE_URL`, `MAX_FILE_SIZE_MB` |
| Event handlers | `camelCase`, prefixed with `handle` | `handleSubmit`, `handleFileChange` |
| Boolean state variables | `camelCase`, prefixed with `is`, `has`, or `can` | `isLoading`, `hasError`, `canRetry` |
| Context files | `PascalCase`, suffixed with `Context` | `AuthContext.jsx` |
| Vite env vars | `VITE_` prefix, `UPPER_SNAKE_CASE` | `VITE_SUPABASE_URL`, `VITE_API_BASE_URL` |

**Additional rules:**
- Props passed to components use `camelCase` throughout; no abbreviations for common props (`className`, not `cls`; `onChange`, not `onChg`).
- Named exports are preferred over default exports for utility functions; React page and component files use default exports.
- Avoid single-letter variable names except as loop indices (`i`, `j`) or trivially scoped callbacks.

### 2.3 Database (SQL / Supabase)

| Construct | Convention | Example |
|---|---|---|
| Table names | `snake_case`, plural | `saved_quizzes`, `class_members` |
| Column names | `snake_case` | `file_id`, `uploaded_by`, `created_at` |
| Primary keys | `id` (uuid) or `<entity>_id` (text) | `id`, `file_id`, `job_id`, `chunk_id` |
| Foreign keys | `<referenced_table_singular>_id` | `class_id`, `student_id`, `uploaded_by` |
| Boolean columns | `is_` or `has_` prefix | `is_shared`, `is_published`, `is_public` |
| Timestamp columns | `_at` suffix | `created_at`, `updated_at`, `joined_at` |
| Trigger functions | `snake_case`, verb phrase | `handle_new_user()`, `jobs_updated_at()` |
| Indexes | `<table>_<column>_idx` | `chunks_embedding_idx`, `chunks_text_idx` |
| RPC functions | `snake_case`, verb phrase | `match_chunks()` |

### 2.4 API Routes

- Path segments use `snake_case` for multi-word resources: `/quiz/generate`, `/upload/status/{job_id}`.
- Path parameters use `snake_case`: `{job_id}`, `{file_id}`.
- Query parameters use `snake_case`: `?top_k=10`, `?class_id=uuid`.
- No trailing slashes on resource endpoints except `/upload/` (legacy; do not add new ones with trailing slashes).

---

## 3. Error Handling

### 3.1 Backend Error Handling

**General principles:**
- All errors returned to the client are `HTTPException` instances raised from route handlers. Services raise Python exceptions; routes catch them and translate to HTTP.
- Never expose raw exception messages, stack traces, or internal identifiers (Supabase row IDs, OpenAI request IDs) to the client in production.
- Log the full exception (including stack trace) at `ERROR` level before raising the sanitized `HTTPException`.

**Standard HTTP error codes used in this project:**

| Code | When to use |
|---|---|
| 400 | Validation failure, empty required field, unsupported file type |
| 401 | Missing or invalid auth token (future, once `get_current_user` is wired) |
| 403 | Role mismatch (student accessing instructor endpoint) |
| 404 | Resource not found (job_id, file_id, quiz_id) |
| 409 | Conflict (e.g., class code already exists) |
| 413 | Upload exceeds `MAX_UPLOAD_SIZE_MB`, or retrieval context exceeds `MAX_CONTEXT_CHARS` |
| 422 | Pydantic validation failure (FastAPI default; do not suppress) |
| 500 | Unhandled exception from service or infrastructure layer |
| 502 | LLM returned an unparseable or schema-invalid response (`LLM_RESPONSE_INVALID`) |
| 503 | Downstream dependency temporarily unavailable (`STORAGE_UNAVAILABLE`) |

**Service layer error handling:**
- Services raise typed exceptions defined in `backend/app/core/exceptions.py`. Do not raise `HTTPException` from services — that is a Layer 1 concern.
- Defined exception hierarchy (to be maintained in `exceptions.py`):

```
AutoQuizError (base)
  ├── IngestionError
  │     ├── UnsupportedFileTypeError
  │     ├── ParseError
  │     └── EmbeddingError
  ├── RetrievalError
  │     └── NoChunksFoundError
  ├── GenerationError
  │     ├── LLMResponseParseError
  │     └── ContextTooLargeError
  └── StorageError
```

- Route handlers catch these specific types and map them to the appropriate `HTTPException`. Uncaught exceptions bubble to FastAPI's default 500 handler.

**Celery task error handling:**
- Tasks catch all exceptions, update `processing_jobs.status` to `failed` and populate `error_code` + `error_message`, then re-raise so Celery marks the task failed.
- `error_code` uses short machine-readable strings: `PARSE_FAILED`, `EMBED_FAILED`, `UPLOAD_FAILED`, `CHUNK_FAILED`.
- Tasks do not retry automatically by default. Retry logic must be explicitly added with a max retry count and exponential backoff if a task targets a flaky external service (e.g., OpenAI embedding calls).

**Logging:**
- Structured JSON per the envelope and event catalog in §14. Do not use
  `print()` statements in any layer.
- Log-level guidelines: `DEBUG` for verbose pipeline internals; `INFO` for
  job state transitions and successful completions; `WARNING` for recoverable
  anomalies (empty retrieval results, fallback to keyword search); `ERROR`
  for all caught exceptions before re-raising.

### 3.1.1 Standard Error Envelope

Every non-2xx JSON response from the FastAPI backend uses the same envelope. FastAPI's default 422 validation response is the one permitted exception — its `detail` array shape is preserved unchanged so Pydantic tooling keeps working.

```json
{
  "error": {
    "code": "UPPER_SNAKE_CASE_STRING",
    "message": "Human-readable, actionable sentence.",
    "details": { "optional": "field-specific machine-readable context" },
    "request_id": "uuid"
  }
}
```

**Envelope rules:**
- `code` is always present and comes from the registry in §3.1.2. Never invent a code at the route level — add it to the registry first.
- `message` is what the frontend may display verbatim. Do not include internal identifiers, stack frames, row IDs, or OpenAI/Supabase request IDs.
- `details` is optional. Use it for field-level validation context (`{ "field": "topic", "reason": "empty" }`) or remediation hints. Never put PII here.
- `request_id` is a server-generated UUID correlating the response to server logs. Route handlers read it from `request.state.request_id`; middleware populates it once per request.
- The HTTP status code and the `code` field must be consistent (e.g., `UPLOAD_TOO_LARGE` always pairs with 413). The registry enforces the pairing.

### 3.1.2 Error Code Registry

Every `error_code` the backend emits — in the API envelope above, in `processing_jobs.error_code`, or in a log line — must appear in this table. Route handlers and Celery tasks import these codes from `backend/app/core/error_codes.py` rather than string-literal them.

**Classification:**
- **Predefined** — user-recoverable; the UI maps the `code` to a specific remediation affordance (re-upload, shorten text, pick fewer questions).
- **Fail-loud** — developer-visible; indicates a bug or broken invariant. User sees a generic message but the code is preserved in logs for triage.
- **Log-and-continue** — unexpected/unknown; always logged at `ERROR` with the full exception, surfaced to the user as `INTERNAL_ERROR` only.

| `error_code`              | HTTP | Class             | User-visible message                                           | Raised by (layer)             |
|---------------------------|------|-------------------|----------------------------------------------------------------|-------------------------------|
| `VALIDATION_FAILED`       | 400  | Predefined        | "One or more fields are invalid. Please check and try again." | Route (non-Pydantic checks)   |
| `EMPTY_TOPIC`             | 400  | Predefined        | "Please enter a topic before generating."                     | Route · `/quiz`, `/retrieve`, `/notes` |
| `UNSUPPORTED_FILE_TYPE`   | 400  | Predefined        | "Only PDF, DOCX, and PPTX files are supported."               | Route · `/upload`             |
| `UPLOAD_TOO_LARGE`        | 413  | Predefined        | "File exceeds the 50 MB limit."                               | Route · `/upload`             |
| `AUTH_REQUIRED`           | 401  | Predefined        | "Please sign in to continue."                                 | Auth dependency (future)      |
| `ROLE_FORBIDDEN`          | 403  | Predefined        | "You don't have permission to perform this action."           | Route (role gate)             |
| `JOB_NOT_FOUND`           | 404  | Predefined        | "We couldn't find that upload job."                           | Route · `/upload/status`      |
| `FILE_NOT_FOUND`          | 404  | Predefined        | "We couldn't find that file."                                 | Route, Service                |
| `QUIZ_NOT_FOUND`          | 404  | Predefined        | "We couldn't find that quiz."                                 | Route · quiz, notes           |
| `CLASS_CODE_CONFLICT`     | 409  | Predefined        | "That class code is already taken. Try another."              | Route · classes               |
| `NO_CONTENT_FOUND`        | 404  | Predefined        | "No matching content was found for this topic."               | Service · retrieval           |
| `CONTEXT_TOO_LARGE`       | 413  | Predefined        | "Too much content to process. Narrow the topic or source."   | Service · quiz_gen, notes     |
| `PARSE_FAILED`            | —    | Fail-loud         | (generic ingestion failure via job record)                    | Celery · ingestion parse      |
| `EMBED_FAILED`            | —    | Fail-loud         | (generic ingestion failure via job record)                    | Celery · ingestion embed      |
| `CHUNK_FAILED`            | —    | Fail-loud         | (generic ingestion failure via job record)                    | Celery · ingestion chunk      |
| `UPLOAD_FAILED`           | —    | Fail-loud         | (generic ingestion failure via job record)                    | Celery · ingestion storage    |
| `LLM_RESPONSE_INVALID`    | 502  | Fail-loud         | "The generator returned an unexpected response. Please retry."| Service · quiz_gen, notes     |
| `STORAGE_UNAVAILABLE`     | 503  | Fail-loud         | "Storage is temporarily unavailable. Please retry shortly."   | Service · storage             |
| `INTERNAL_ERROR`          | 500  | Log-and-continue  | "Something went wrong on our end. Please try again."          | Any (catch-all)               |

**Registry rules:**
- Codes are `UPPER_SNAKE_CASE`, domain-first where helpful (`UPLOAD_*`, `QUIZ_*`).
- Adding a new code is a DESIGN.md change first, code second — keep this table authoritative.
- Each exception class in the §3.1 hierarchy maps to exactly one code; the route→HTTP mapping is table-driven, not `if/elif` sprawl.
- Celery-only codes (no HTTP column) populate `processing_jobs.error_code`. The API surfaces them via `JobStatusResponse.error_code` using the same strings.
- `INTERNAL_ERROR` is the only code that may be emitted without a dedicated exception class — it is the last-resort mapping for uncaught exceptions.

### 3.2 Frontend Error Handling

**General principles:**
- Every `fetch()` / `axios` call in a page must handle both network errors (no response) and non-2xx responses explicitly. Never assume a request succeeded without checking `response.ok` or the axios status.
- User-visible error messages must be human-readable and actionable. Do not surface raw API error JSON or HTTP status codes directly in the UI.

**Patterns:**

```
API call → success → update state and render result
         → 4xx     → show inline error message near the triggering action
         → 5xx     → show generic "something went wrong" banner; log details to console
         → network → show "unable to reach server" message; offer retry if idempotent
```

- Use a `try / catch / finally` pattern with a `finally` block that always clears loading state, preventing perpetually spinning buttons.
- Form validation errors (empty topic, unsupported file type) are caught client-side before any API call and displayed inline below the relevant field — not as a toast or modal.
- Non-recoverable errors on page load (e.g., a quiz ID that returns 404) redirect to the relevant dashboard rather than rendering a broken page.

**Error state in components:**
- Pages track error state with a dedicated `error` variable (`const [error, setError] = useState(null)`), not by overloading `data` or `loading` state.
- `error` is reset to `null` at the start of each new request, so stale errors do not persist across retries.
- Components receive errors via props if they need to render error UI; they do not fetch or derive error state themselves.

**Console discipline:**
- `console.error()` is permitted for caught exceptions during development. All `console.log()` debug statements must be removed before merging to main.
- In production builds (Vite `mode=production`), no sensitive data (tokens, user IDs, full API responses) should appear in console output.

---

## 4. Authentication & Role Model

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
operations — it bypasses RLS. This is a known gap (see Section 12). Route-level auth
enforcement is therefore the responsibility of each route handler until RLS is tightened.

---

## 5. Database Schema

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

#### `student_notes`
| Column       | Type        | Notes                                            |
|--------------|-------------|--------------------------------------------------|
| `id`         | uuid (PK)   | default `gen_random_uuid()`                      |
| `title`      | text        | not null                                         |
| `topic`      | text        | not null                                         |
| `file_id`    | text        | nullable; FK → `uploaded_files(file_id)` ON DELETE SET NULL |
| `created_by` | uuid (FK)   | → `profiles(id)` ON DELETE CASCADE; not null     |
| `content`    | jsonb       | full notes object (summary, key_concepts, …)     |
| `created_at` | timestamptz | default `now()`                                  |

RLS: `SELECT/INSERT/UPDATE/DELETE` scoped to `created_by = auth.uid()`. Do not reuse `class_notes` — that table is instructor-scoped and class-keyed.

### RLS posture

RLS is **enabled on all tables** but current policies use `auth_all` (full access for any
authenticated user). This is a known temporary state — tighten to owner-scoped policies
before production. The design-validator should flag any new feature that adds sensitive
data without a corresponding RLS policy tightening plan.

---

## 6. API Contracts

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
| GET    | `/quiz/my`        | —             | `SavedQuiz[]` (200) — saved quizzes for the authenticated student, newest-first | 401 unauthenticated |

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

| Method | Path               | Request body       | Success response | Error codes |
|--------|--------------------|--------------------|------------------|-------------|
| POST   | `/notes/generate`  | `NotesRequest`     | notes object (200) | 401 unauthenticated |
| POST   | `/notes/save`      | `NotesSaveRequest` | `NotesSaveResponse` (200) | 401 unauthenticated, 500 save failed |
| GET    | `/notes/my`        | —                  | `NotesSaveResponse[]` (200) — student's saved notes, newest-first | 401 unauthenticated |
| GET    | `/notes/{id}`      | —                  | full `student_notes` row (200) | 401 unauthenticated, 403 not owner, 404 not found |

**`NotesRequest`:**
```json
{ "topic": "string", "file_id": "string|null", "outside_sources": false }
```

**`NotesSaveRequest`:**
```json
{ "topic": "string", "file_id": "string|null", "content": { } }
```

**`NotesSaveResponse`:**
```json
{ "id": "uuid", "title": "string", "topic": "string", "created_at": "ISO8601" }
```

### Flashcards

| Method | Path               | Request body | Success response | Error codes |
|--------|--------------------|--------------|------------------|-------------|
| GET    | `/flashcards/my`   | —            | `FlashcardSet[]` (200) — flashcard sets for the authenticated student, newest-first | 401 unauthenticated |

---

## 7. RAG Pipeline

The pipeline runs in three phases. Each phase maps to a service file.

```
Phase 1 — Ingestion (async, Celery)          backend/app/services/ingestion.py
  File upload → Supabase Storage
  → parse (PDF/DOCX/PPTX) via LlamaIndex readers   backend/app/utils/parsers.py
    (PDFReader, DocxReader, PptxReader — preserves page numbers in node metadata)
  → chunk into TextNodes via LlamaIndex SentenceSplitter
    (chunk_size=CHUNK_SIZE_TOKENS=400, chunk_overlap=CHUNK_OVERLAP_TOKENS=60)
  → embed (text-embedding-3-small)
  → map TextNode → chunks row; store in pgvector
    (TextNode.text → chunks.text; metadata.page_label → chunks.page_numbers;
     metadata.section_title → chunks.section_title)

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
6. **LlamaIndex owns parsing and chunking only.** Use LlamaIndex readers and
   `SentenceSplitter` to produce `TextNode` objects. Do not use LlamaIndex's
   `VectorStoreIndex` or `SupabaseVectorStore` — write nodes to the existing `chunks`
   table directly. This keeps the storage layer fully under our schema control.

---

## 8. Frontend Architecture

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

## 9. Async Architecture

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

## 10. Configuration

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

## 11. Testing Standards

### 11.1 Backend Testing

**Framework:** `pytest` with `pytest-asyncio` for async route tests.

**Directory structure:**
```
backend/
  tests/
    unit/
      services/
        test_quiz_gen.py
        test_retrieval.py
        test_ingestion.py
      utils/
        test_parsers.py
    integration/
      test_upload_routes.py
      test_quiz_routes.py
      test_notes_routes.py
    conftest.py          ← shared fixtures (test client, mock Supabase, mock OpenAI)
```

**Coverage targets:**

| Layer | Target | Notes |
|---|---|---|
| Services (Layer 2) | 80% line coverage | Core business logic; highest priority |
| Route handlers (Layer 1) | 70% line coverage | Focus on validation and error mapping |
| Utils / parsers (Layer 3) | 60% line coverage | Parser edge cases (malformed PDFs, empty PPTX) |
| Celery tasks | Key happy-path + failure state | Test task logic, not Celery internals |

**Unit test rules:**
- Services are tested in isolation. Mock all external dependencies: Supabase client, OpenAI client, Redis.
- Use `unittest.mock.patch` or `pytest-mock`'s `mocker` fixture. Do not make real network calls in unit tests.
- Each test function tests exactly one behavior. Name tests as `test_<function>_<scenario>`: `test_generate_quiz_returns_five_questions`, `test_embed_chunks_raises_on_openai_error`.
- Fixtures for common objects (mock chunk list, mock quiz request, mock job record) live in `conftest.py` and are reused across test files.

**Integration test rules:**
- Use FastAPI's `TestClient` (synchronous) or `httpx.AsyncClient` for async routes.
- Integration tests may call a real local Supabase instance (via `.env.test`) or a fully mocked one — document the choice in `conftest.py`.
- Integration tests cover the full route → service → (mocked) DB path. They do not test the DB schema itself.
- One integration test file per route module. Test the happy path, at least one 4xx case per validation rule, and the 500 path for unhandled service errors.

**What not to test:**
- Pydantic model instantiation in isolation (FastAPI's 422 behavior covers this).
- Supabase SDK internals or OpenAI SDK internals.
- Celery task scheduling and worker infrastructure (test task logic, not the broker).

### 11.2 Frontend Testing

**Framework:** `Vitest` + `React Testing Library`. End-to-end tests use `Playwright`.

**Directory structure:**
```
frontend/src/
  __tests__/
    components/
      QuizView.test.jsx
      Upload.test.jsx
      ProtectedRoute.test.jsx
    pages/
      instructor/
        Dashboard.test.jsx
      student/
        Generate.test.jsx
    hooks/
      useAuth.test.js
  e2e/                        ← Playwright tests (separate from unit/component tests)
    quiz_flow.spec.ts
    upload_flow.spec.ts
```

**Coverage targets:**

| Area | Target | Notes |
|---|---|---|
| Reusable components | 80% line coverage | `QuizView`, `Upload`, `ProtectedRoute`, `TopicSearch` |
| Custom hooks | 90% line coverage | `useAuth` and any future hooks |
| Pages | Happy path + error state | Full coverage is secondary to component coverage |
| E2E | Critical user flows only | Upload → quiz generate → review; student join → take quiz |

**Component test rules:**
- Use `render()` from React Testing Library. Do not test implementation details (internal state, refs, class names used purely for styling).
- Mock `fetch` / `axios` using `vi.mock` or `msw` (Mock Service Worker). Do not make real API calls in component tests.
- Assert on what the user sees: rendered text, ARIA roles, button disabled states. Do not assert on raw HTML structure.
- `AuthContext` must be provided in tests via a wrapper. Export a `renderWithAuth(ui, { role })` helper from a test utility file.
- Each test file imports only from the component under test and test utilities. No cross-component imports in tests.

**E2E test rules (Playwright):**
- E2E tests run against a fully running dev stack (FastAPI + Supabase + frontend). They are not run in CI by default — only on pre-release branches.
- E2E tests use dedicated test user accounts seeded in Supabase before the test run. Never reuse production or development user credentials.
- Each spec file covers one user flow end-to-end. Flows are independent — no shared state between spec files.

**What not to test:**
- Styling and layout details (colors, margins, font sizes).
- Third-party library internals (Supabase JS client, React Router).
- The FastAPI backend behavior from frontend tests — that is covered by backend integration tests.

---

## 12. Known Gaps & Constraints

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
| GAP-7 | No rate limiting on generation endpoints        | Uncapped OpenAI spend per user; abuse vector    |
| GAP-8 | No client log sink for frontend events          | Frontend lifecycle events only reach `console`   |

---

## 13. Security Constraints

These are non-negotiable. The design-validator flags any violation as CRITICAL
unless a lower severity is explicitly noted.

### 13.1 Confidentiality

1. **Row-level ownership checks on every read/write.** Until RLS is tightened
   (GAP-1), every route that returns or mutates user-owned data filters on the
   authenticated `actor_id`. Services must never return cross-user rows by
   accident.
2. **Service key is server-side only.** `SUPABASE_SERVICE_KEY` lives in
   `backend/.env` and nowhere else — never in frontend code, git history,
   client logs, or error responses.
3. **Invite codes are shareable tokens, not secrets.** Display to instructors
   only by default; revocable by regenerating.
4. **Public share links use `share_code`, never row IDs.** The `id` column is
   never embedded in a shareable URL.

### 13.2 Integrity

1. **All writes validate at the Layer 1 boundary.** Pydantic schemas in
   `backend/app/models/schemas.py` are the single validation surface —
   services trust their inputs.
2. **Enum fields validated against a closed set.** `difficulty`, `role`,
   `status`, `question_type`, `set_type`. Open-string enums are **MAJOR**.
3. **Audit-relevant fields are append-only.** `processing_jobs.created_at`,
   `saved_quizzes.created_by`, `class_members.joined_at` must not be mutated
   by application code after the initial write.
4. **Generated content is never silently truncated.** If an LLM response
   fails schema validation, raise `LLM_RESPONSE_INVALID` (502) — never return
   partial content.

### 13.3 Authenticity

1. **Until `get_current_user` ships (GAP-2), each protected route re-derives
   the actor from the bearer token via `supabase.auth.get_user()` inside the
   handler.** No route trusts an `actor_id` supplied in the request body.
2. **Frontend never sets `actor_id` in a request body.** The backend derives
   it from the token. Any route that accepts `actor_id` as input is a
   **CRITICAL** violation.
3. **Signed uploads.** When direct-to-storage uploads are introduced, use
   short-lived signed URLs (≤5 minutes) scoped to the caller's class
   membership.

### 13.4 Accountability

1. **Every state-changing action emits a structured log event** (see §14).
   Reads do not need to log unless they cross user boundaries.
2. **Every event carries `actor_id`, `actor_role`, `resource_type`,
   `resource_id`, `request_id`, `outcome`** so a bad action can be traced
   end-to-end.
3. **`request_id` correlation.** Middleware generates a UUID per request and
   attaches it to `request.state.request_id`. Every log line and every error
   envelope includes it. Celery tasks inherit it via task kwargs.

### 13.5 Privacy & Data Retention

1. **No PII in logs, event `meta`, error messages, or analytics.** Forbidden
   in all fields: email addresses, full names, file contents, chunk text,
   question text, note summaries. Use `actor_id` (UUID) instead of email
   anywhere user identity is needed. If a value must be retained for debugging
   and could carry PII, hash it with SHA-256 and log the first 8 hex chars.
2. **Minimise what is stored.** `profiles` keeps `email`, `full_name`, `role`,
   and `avatar_url`. No bios, location, social IDs, or third-party identifiers
   unless a feature explicitly requires them and documents retention.
3. **Deletion semantics.** When a profile row is deleted (FK CASCADE from
   `auth.users`), owned classes, quizzes, flashcards, notes, and processing
   jobs are deleted transitively via `ON DELETE CASCADE`. Cross-user
   references (e.g. `saved_quizzes.class_id`) use `ON DELETE SET NULL`.
4. **Retention policy.** `processing_jobs` rows with `status='success'` older
   than 90 days may be purged by a scheduled task (not yet built). Failed
   jobs retained indefinitely for debugging.

### 13.6 Compliance Posture

1. **FERPA.** Student-identifiable academic records (quiz results, flashcard
   performance, saved notes) are treated as educational records. Never expose
   them cross-class or to anyone other than the owning student and their
   class's instructor.
2. **GDPR.** EU users have data-subject rights (access, deletion, export).
   A deletion request is satisfied by cascading delete of the `profiles` row.
   An export endpoint is not yet built — must land before onboarding EU users.
3. **Data location.** Supabase region is the primary compliance surface.
   Document the chosen region in deployment docs before production launch.

### 13.7 Rate Limiting & Abuse Prevention

1. **Per-actor rate limits on generation endpoints.** `/quiz/generate` and
   `/notes/generate` must be capped per authenticated user — default 20
   requests/hour — to bound OpenAI spend. Implemented via Redis counters
   keyed on `actor_id` (GAP-7).
2. **Upload rate limits.** Max 20 uploads/hour per user; max 200/hour per class.
3. **LLM output size cap.** Every LLM response passes through a 64 KB length
   guard before schema validation; oversize responses raise
   `LLM_RESPONSE_INVALID`.

### 13.8 Foundational Rules

1. **No SQL string concatenation.** All DB queries use the Supabase client's
   parameterised methods.
2. **No user input injected raw into LLM prompts.** All user-controlled values
   pass through a pre-written mapping dict before entering a prompt string.
3. **No API keys in frontend source.** `SUPABASE_SERVICE_KEY` must never
   appear in Vite env vars or frontend code.
4. **File type validation is extension + MIME.** Allowed: `.pdf`, `.docx`,
   `.pptx`. Reject all others at the upload route boundary.
5. **Max upload size enforced before reading full file into memory.** 50 MB.
6. **CORS is explicit allowlist only.** No `allow_origins=["*"]`.
7. **Secrets never land in git.** `.env` files are gitignored; pre-commit
   hook rejects commits containing `sk-`, `eyJ`, or recognisable JWT / API
   key patterns.

---

## 14. Structured Logging & Event Catalog

Every server-side log line is a structured JSON record with the envelope in
§14.1. Unstructured log lines, `print()` statements, and PII-carrying messages
are forbidden. The design-validator flags violations as **MAJOR**.

### 14.1 Event Envelope

```json
{
  "timestamp": "2026-04-24T15:19:14Z",
  "event": "dot.separated.name",
  "level": "INFO | WARNING | ERROR | DEBUG",
  "actor_id": "uuid | null",
  "actor_role": "instructor | student | system | null",
  "resource_type": "file | job | quiz | note | class | flashcard_set | null",
  "resource_id": "string | null",
  "request_id": "uuid | null",
  "duration_ms": "int | null",
  "outcome": "success | failure",
  "error_code": "string | null",
  "meta": { "feature-specific non-PII fields" }
}
```

**Envelope rules:**
1. Every log line includes `timestamp`, `event`, `level`, `outcome`. Other
   fields are nullable.
2. `actor_id` is a UUID. Never log emails, names, file contents, or question
   text in any field.
3. `request_id` comes from `request.state.request_id` (populated by
   middleware); Celery tasks inherit it via task kwargs.
4. `duration_ms` is present on every event whose `event` name ends in
   `.completed` or `.failed`.
5. The envelope is emitted by a single helper (`backend/app/core/logging.py`
   → `log_event()`) — no ad-hoc `logger.info("...")` string-formatting in
   service or route code.

### 14.2 Event Naming

`domain.entity.action` — past tense for completions, imperative for starts.

Allowed domains: `auth`, `upload`, `ingestion`, `retrieval`, `quiz`,
`notes`, `flashcard`, `class`, `profile`. Adding a new domain requires a
DESIGN.md edit.

### 14.3 Event Catalog

| event                         | level   | outcome  | Fires from              | meta fields                                         |
|-------------------------------|---------|----------|-------------------------|-----------------------------------------------------|
| `auth.session.started`        | INFO    | success  | Frontend · AuthContext  | —                                                   |
| `auth.session.ended`          | INFO    | success  | Frontend · AuthContext  | —                                                   |
| `upload.file.accepted`        | INFO    | success  | Route · upload          | `mime_type`, `size_bytes`                           |
| `upload.file.rejected`        | WARNING | failure  | Route · upload          | `reason` (`ext` \| `size`), `size_bytes`            |
| `ingestion.job.started`       | INFO    | success  | Celery · ingest         | `file_id`, `stage`                                  |
| `ingestion.job.completed`     | INFO    | success  | Celery · ingest         | `chunk_count`, `stages_run`                         |
| `ingestion.job.failed`        | ERROR   | failure  | Celery · ingest         | `stage`, `exception_type`                           |
| `retrieval.search.completed`  | INFO    | success  | Service · retrieval     | `top_k`, `chunks_returned`, `fallback_keyword`      |
| `quiz.generate.started`       | INFO    | success  | Service · quiz_gen      | `difficulty`, `num_questions`, `outside_sources`    |
| `quiz.generate.completed`     | INFO    | success  | Service · quiz_gen      | `questions_returned`, `prompt_tokens`, `completion_tokens` |
| `quiz.generate.failed`        | ERROR   | failure  | Service · quiz_gen      | `error_code`, `exception_type`                      |
| `quiz.save.completed`         | INFO    | success  | Route · quiz            | `quiz_id`, `is_shared`                              |
| `quiz.share.toggled`          | INFO    | success  | Route · quiz            | `quiz_id`, `is_shared`                              |
| `notes.generate.started`      | INFO    | success  | Service · notes_gen     | `outside_sources`                                   |
| `notes.generate.completed`    | INFO    | success  | Service · notes_gen     | `has_file`, `prompt_tokens`                         |
| `notes.generate.failed`       | ERROR   | failure  | Service · notes_gen     | `error_code`, `exception_type`                      |
| `notes.save.completed`        | INFO    | success  | Route · notes           | `note_id`                                           |
| `notes.save.failed`           | ERROR   | failure  | Route · notes           | `error_code`, `exception_type`                      |
| `notes.publish.toggled`       | INFO    | success  | Route · notes           | `note_id`, `is_published`                           |
| `flashcard.set.created`       | INFO    | success  | Route · flashcards      | `set_id`, `card_count`, `set_type`                  |
| `flashcard.set.shared`        | INFO    | success  | Route · flashcards      | `set_id`, `scope` (`class` \| `public`)             |
| `class.created`               | INFO    | success  | Route · classes         | `class_id`                                          |
| `class.member.joined`         | INFO    | success  | Route · classes         | `class_id`                                          |
| `class.member.removed`        | INFO    | success  | Route · classes         | `class_id`, `removed_by_instructor`                 |
| `profile.updated`             | INFO    | success  | Route · profiles        | `fields_changed` (list)                             |

Adding a new event is a DESIGN.md change first, code change second. The
design-validator flags any emitted event not in this table as **MAJOR**.

### 14.4 Layer Ownership of Events

- **Layer 1 (routes):** entry/exit of user-initiated actions
  (`upload.file.accepted`, `quiz.save.completed`, `profile.updated`).
- **Layer 2 (services):** events surrounding external calls (LLM, retrieval)
  with `duration_ms` populated.
- **Celery tasks:** `*.started` / `*.completed` / `*.failed` at the task boundary.
- **Frontend:** emits auth lifecycle events only. Until GAP-8 is closed, they
  go to `console.info` using the same envelope; a server sink endpoint is a
  future addition.

### 14.5 PII Forbidden List

Never emit the following in `meta`, `error_code`, `message`, or any other
logged field:

- Email addresses, full names, usernames
- File contents, extracted chunk text, quiz question text, note content
- Tokens, API keys, session IDs, raw SQL payloads
- IP addresses (permissible only in infrastructure layer access logs, not
  application logs)

When a value could carry PII and is needed for debugging, SHA-256 the value
and log the first 8 hex chars (`meta.topic_hash = "a1b2c3d4"`).

---

## 15. Brand & UX System

A shared design vocabulary keeps the product coherent across pages and makes
accessibility auditable. Tokens are Tailwind-first; `frontend/tailwind.config.js`
is the source of truth. Components must consume tokens, never hand-authored
hex values.

### 15.1 Color Tokens

Exposed as CSS custom properties on `:root` and `html.dark`; mirrored into
Tailwind via `theme.extend.colors`.

| Token             | Light (Tailwind)         | Dark (Tailwind)          | Usage                          |
|-------------------|--------------------------|--------------------------|--------------------------------|
| `--color-bg`      | `slate-50`   `#f8fafc`   | `slate-900`  `#0f172a`   | App background                 |
| `--color-surface` | `white`      `#ffffff`   | `slate-800`  `#1e293b`   | Cards, modals, inputs          |
| `--color-border`  | `gray-100`   `#f3f4f6`   | `slate-700`  `#334155`   | Dividers, input outlines       |
| `--color-text`    | `gray-900`   `#111827`   | `slate-100`  `#f1f5f9`   | Body text                      |
| `--color-muted`   | `gray-500`   `#6b7280`   | `slate-400`  `#94a3b8`   | Secondary / helper text        |
| `--color-primary` | `violet-600` `#7c3aed`   | `violet-400` `#a78bfa`   | Primary CTA, active nav        |
| `--color-accent`  | `indigo-600` `#4f46e5`   | `indigo-400` `#818cf8`   | Gradient partner to primary    |
| `--color-success` | `emerald-600` `#059669`  | `emerald-400` `#34d399`  | Success toasts, confirmations  |
| `--color-warning` | `amber-500`  `#f59e0b`   | `amber-400`  `#fbbf24`   | Warnings, pending states       |
| `--color-danger`  | `red-600`    `#dc2626`   | `red-400`    `#f87171`   | Errors, destructive actions    |

**Contrast rule:** body text pairs must meet **WCAG 2.1 AA** (≥4.5:1).
Interactive elements at default and hover states must meet AA. Verified in
both themes by the prototyper before merge.

### 15.2 Typography

| Token         | Value                                                                |
|---------------|----------------------------------------------------------------------|
| Font family   | `Inter, ui-sans-serif, system-ui, sans-serif` (Tailwind `font-sans`) |
| Mono family   | `ui-monospace, SFMono-Regular, Menlo, monospace`                     |
| Base size     | 16 px (`text-base`)                                                  |
| Line height   | 1.5 body · 1.25 headings                                             |
| Heading scale | h1 `text-3xl` · h2 `text-2xl` · h3 `text-xl` · h4 `text-lg`          |
| Weight usage  | 400 body · 500 labels · 600 headings · 700 brand emphasis            |

### 15.3 Spacing & Layout

- **4 px base grid.** Spacing tokens use Tailwind's default scale
  (`space-1` = 4 px).
- **Page width:** primary pages centred within `max-w-5xl` (64 rem).
- **Vertical rhythm:** 24 px between form fields, 40 px between page sections.

### 15.4 Radius & Elevation

| Token          | Value     | Usage                 |
|----------------|-----------|-----------------------|
| `rounded-sm`   | 2 px      | Chips, tags           |
| `rounded-md`   | 6 px      | Buttons, inputs       |
| `rounded-lg`   | 8 px      | Cards, modals         |
| `rounded-2xl`  | 16 px     | Hero panels           |
| `shadow-sm`    | subtle    | Resting cards         |
| `shadow-md`    | standard  | Hover, popovers       |
| `shadow-lg`    | elevated  | Modals only           |

### 15.5 Motion

| Token           | Duration | Easing                             | Usage                        |
|-----------------|----------|------------------------------------|------------------------------|
| `--motion-fast` | 100 ms   | ease-out                           | Theme toggle, focus rings    |
| `--motion-base` | 200 ms   | ease-in-out                        | Buttons, links               |
| `--motion-slow` | 400 ms   | cubic-bezier(0.4, 0, 0.2, 1)       | Page transitions             |

Respect `prefers-reduced-motion`. When set, animations collapse to instant
state changes.

### 15.6 Component Pattern Library

Reuse before invent. Existing patterns in `frontend/src/components/` that
must be preferred over new ones:

| Pattern               | Component            | Purpose                               |
|-----------------------|----------------------|---------------------------------------|
| Top navigation        | `TopBar.jsx`         | Only nav surface — extend, don't replace |
| Route gate            | `ProtectedRoute.jsx` | Role + auth enforcement               |
| Quiz render           | `QuizView.jsx`       | Multi-type question rendering         |
| File upload           | `Upload.jsx`         | Upload + job polling                  |
| Topic form            | `TopicSearch.jsx`    | Topic + difficulty + options          |

Adding a new shared component requires the feature spec's Design Decisions
section to state why no existing pattern fits.

### 15.7 GUI Checklist

Every frontend feature satisfies the following before the prototyper marks a
component done. The req-validator checks for evidence of each item.

- [ ] **Five states:** idle, loading, empty, success, error — each designed
      and render-tested.
- [ ] **Learnability:** a first-time user completes the happy path without
      documentation. Primary affordance is visually distinct.
- [ ] **Recognizability:** reuses existing patterns from §15.6 where applicable.
- [ ] **Keyboard operability:** linear tab order, visible focus outline on
      every interactive element, Escape closes modals, Enter submits forms.
- [ ] **Accessibility floor:** WCAG 2.1 AA contrast; every form input has an
      associated label (`<label htmlFor>` or `aria-label`); every button has
      an accessible name.
- [ ] **Responsive:** works at 375 px (mobile) and 1440 px (desktop) viewports.
- [ ] **Dark mode parity:** every surface tested in `html.dark` with no
      hardcoded hex values.
- [ ] **Reduced motion:** animations disabled when
      `prefers-reduced-motion: reduce` is set.

### 15.8 Copy & Voice

- Active voice, sentence case for button labels and headings.
- User-facing error messages are concrete and actionable ("File exceeds 50 MB
  limit" not "Error: invalid file"). Copy aligns with the error registry in
  §3.1.2.
- Empty states include a next step ("Upload your first class material to get
  started"), not just the fact of absence.