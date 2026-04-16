# Feature Brief: Notes Generation (Student)

---

## 1. Summary

**Feature:** Students can generate structured AI study notes on any topic — optionally grounded in a document they have uploaded — and save those notes to their personal dashboard for later reference.
**Requested by:** Student
**Priority:** High

Story 9.1 (generation) is partially implemented: the backend route and LLM service exist but the route is missing its auth guard. Story 9.2 (saving) is not implemented: the Save button is absent from the rendered UI, no `student_notes` table exists, and saved notes do not appear on the student dashboard.

---

## 2. User Stories

### Story 9.1 — Generate study notes from uploaded material

**As a** student,
**I want** to generate structured study notes on a topic from a document I have uploaded,
**so that** I have a concise summary to review.

**Acceptance Criteria:**
- [ ] AC-9.1.1: The notes generation page (`/notes`) provides a topic input field. The Generate button is disabled when the topic field is empty or whitespace-only.
- [ ] AC-9.1.2: `POST /notes/generate` is protected by the `get_current_user` auth dependency. Unauthenticated requests receive HTTP 401.
- [ ] AC-9.1.3: When `file_id` is provided, the system retrieves the top 15 most relevant chunks via hybrid search and passes them as context to GPT-4o.
- [ ] AC-9.1.4: The response contains a structured notes object with at minimum: `summary` (string), `key_concepts` (array of `{term, definition, example}`), `important_details` (array of strings), and `common_misconceptions` (array of strings).
- [ ] AC-9.1.5: When no `file_id` is provided, `outside_sources` defaults to `true` and the system generates notes from GPT-4o's general knowledge without attempting retrieval.

---

### Story 9.2 — Save generated notes

**As a** student,
**I want** to save a set of notes I have generated,
**so that** I can access them later from my dashboard.

**Acceptance Criteria:**
- [ ] AC-9.2.1: After notes are generated, a Save button is displayed. Clicking it inserts a row into `student_notes` with `title` (the topic), `topic`, `file_id` (nullable), `created_by` (from JWT), and `content` (the full notes JSON object).
- [ ] AC-9.2.2: `created_by` is sourced exclusively from the authenticated user's JWT — never from client payload.
- [ ] AC-9.2.3: After a successful save, the Save button is replaced by a confirmation indicator and is not clickable again for the same set of notes.
- [ ] AC-9.2.4: Saved notes appear on the student dashboard under a "My Notes" tab (or equivalent section), accessible via a link to `/notes/:id`.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | Generate notes; save personal notes; view their own saved notes | View another student's personal notes | FastAPI `get_current_user` on `POST /notes/generate`; Supabase RLS on `student_notes` (`created_by = auth.uid()` for all operations) |
| Instructor | None — notes generation and saving are student-facing in this feature | Access student notes generation page | `ProtectedRoute allowedRole="student"` |
| Unauthenticated | None | `POST /notes/generate`; all save/read operations | FastAPI `get_current_user` dependency (currently missing — MAJOR gap) |

> The `POST /notes/generate` route currently has **no auth dependency** — any unauthenticated caller can consume GPT-4o tokens via this endpoint. The prototyper must add `get_current_user` before proceeding to tests.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes — for saved notes (Story 9.2)
- **New table required:** `student_notes`
  - Proposed columns: `id` (uuid PK, default `gen_random_uuid()`), `title` (text, not null), `topic` (text, not null), `file_id` (text nullable FK → `uploaded_files.file_id`), `created_by` (uuid FK → `profiles.id`, not null), `content` (jsonb, not null), `created_at` (timestamptz, default `now()`)
- **Migration required:** Yes — `student_notes` table does not exist in the current schema
- **RLS required:** Yes — `SELECT/INSERT/UPDATE/DELETE` scoped to `created_by = auth.uid()`
- **Note:** Do not reuse `class_notes` for this purpose; `class_notes` is instructor-scoped and class-keyed

### 4b. Backend architecture

- **Generate route:** `POST /notes/generate` in `backend/app/api/routes/notes.py` — exists but must add `current_user: dict = Depends(get_current_user)`. No structural changes to the generation logic.
- **Save route:** New `POST /notes/save` route (or equivalent) in `backend/app/api/routes/notes.py` — inserts into `student_notes`; `created_by` set from JWT; returns the saved row including the new `id`.
- **Load route:** New `GET /notes/{id}` route — fetches a `student_notes` row by ID; returns 404 if not found; enforces ownership.
- **Async / sync?** Synchronous FastAPI routes.
- **LLM involvement?** Only in generation (already implemented); save/load are pure DB operations.
- **Pydantic schemas:** New `NotesSaveRequest` model (`topic`, `file_id`, `content`) and `NotesSaveResponse` model (`id`, `title`, `topic`, `created_at`).

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/Notes.jsx` — add Save button after generation; confirmation state after save; `saved` and `setSaved` state already declared but unused — wire them up
  - `frontend/src/pages/student/Dashboard.jsx` — add a "My Notes" section/tab displaying the student's saved notes fetched from `student_notes`; each entry links to `/notes/:id`
- **Save flow:** On button click, POST to `/notes/save` with `{topic, file_id, content}`; on success set `saved = true`; replace button with confirmation indicator
- **State scope:** Local component state in `Notes.jsx`; dashboard fetches from `student_notes` alongside existing queries
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No — notes generation already calls `hybrid_search` with `top_k=15`.
- **Affects LLM prompt in `notes_gen.py`?** No changes required.

### 4e. Security considerations

- **Unauthenticated LLM access (CRITICAL):** `POST /notes/generate` currently has no `get_current_user` dependency. Any unauthenticated request can trigger a live GPT-4o call. This must be fixed before proceeding to any other work in this feature.
- **User-controlled data injected into LLM prompts?** Yes — `topic` is interpolated into the prompt in `notes_gen.py`. Confirm the existing implementation does not sanitise this; if the topic is a raw f-string interpolation, the design-validator should flag it as a concern (though it is the same pattern used by quiz generation).
- **New SQL queries?** Yes — `student_notes` insert and select use the Supabase Python client with parameterised queries; `created_by` always from JWT.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- Editing or deleting saved student notes
- Sharing student-generated notes with a class (instructor notes sharing is FEAT-010)
- Publishing or visibility controls on student notes (personal notes are private by default)
- Student notes appearing on the student dashboard's "Class Notes" tab (that tab is for `class_notes` only)
- Flashcard generation from notes content
- Scoring or assessment from notes

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Should the Save route be `POST /notes/save` (separate endpoint) or should the generate endpoint optionally persist? | pipeline | Prefer a separate `POST /notes/save` — keeps generation stateless and easier to test independently |
| 2 | Should the student dashboard show personal saved notes in a new tab, or merge them with the existing "Class Notes" tab? | pipeline | New separate tab/section — class notes and personal notes have different origins and should not be conflated |
| 3 | Does `topic` f-string interpolation in `notes_gen.py` require input sanitisation, or is it acceptable given the same pattern is used by quiz generation? | pipeline | Design-validator should assess and flag if the risk profile differs from `quiz_gen.py` |

---

## 7. Test Boundaries

- **External deps to mock:** `openai.chat.completions.create` (generation), `supabase.from('student_notes')` (insert, select by ID), `POST /notes/generate` (for frontend save flow)
- **Fixtures needed:**
  - An authenticated student user with a saved `student_notes` row
  - A `student_notes` row owned by a different student (to test isolation)
  - A non-existent notes ID (to test 404)
- **Integration vs. unit boundary:**
  - `POST /notes/generate` auth guard = integration test asserting HTTP 401 when no token is provided
  - `POST /notes/save` = integration test asserting correct insert shape (`created_by` from JWT, `content` matches notes object)
  - `GET /notes/{id}` = integration test asserting 404 on missing ID and 403/404 on another user's notes
  - `notes_gen.generate_notes()` = unit test asserting response shape contains required keys
- **Frontend test targets:**
  - `Notes.jsx` — Generate button disabled when topic empty; Save button appears after generation; Save button replaced by confirmation indicator after save; Save button not clickable again
  - `Dashboard.jsx` — saved notes from `student_notes` appear in personal notes section; class notes tab remains scoped to `class_notes` only
- **Explicitly out of test scope:** live OpenAI calls, live Supabase writes, RLS enforcement against a live DB
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-009-notes-generation-student.md`
