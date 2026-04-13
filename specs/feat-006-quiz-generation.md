# Feature Brief: Quiz Generation

---

## 1. Summary

**Feature:** Quiz generation — students generate quizzes on a topic grounded in an uploaded document or from general knowledge, with configurable difficulty and question count. The system retrieves relevant chunks via hybrid search and calls GPT-4o to produce structured quiz questions.
**Requested by:** Student
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 6.1 — Generate a quiz from uploaded material

**As a** student,
**I want** to generate a quiz on a topic from a document I have uploaded,
**so that** I can test my understanding of the course content.

**Acceptance Criteria:**
- [x] AC-6.1.1: The quiz generation request requires a non-empty `topic`. A request with an empty or whitespace-only topic returns HTTP 400.
- [x] AC-6.1.2: When `file_id` is provided, the system retrieves the top 12 most relevant chunks from that file via hybrid search (vector + keyword) before generating questions.
- [x] AC-6.1.3: When `file_id` is provided but no relevant content is found and `outside_sources = false`, the API returns HTTP 404 with a descriptive message.
- [x] AC-6.1.4: The response contains a `questions` array where each item includes: `question_id`, `type`, `question`, `answer`, `explanation`, `source_chunk_ids`, and `page_numbers`. MCQ items also include `options` (array of `{label, text}`).
- [x] AC-6.1.5: The number of questions in the response matches the `num_questions` parameter (default: 5).

---

### Story 6.2 — Select difficulty level

**As a** student,
**I want** to choose the difficulty of the generated quiz (easy, medium, or hard),
**so that** the questions match my current study level.

**Acceptance Criteria:**
- [x] AC-6.2.1: The `difficulty` parameter accepts exactly three values: `"easy"`, `"medium"`, `"hard"`. Any other value returns HTTP 422.
- [x] AC-6.2.2: `difficulty` defaults to `"medium"` when omitted from the request.
- [x] AC-6.2.3: The chosen difficulty is reflected in the LLM prompt sent to GPT-4o.
- [x] AC-6.2.4: The `difficulty` value is included in the `QuizResponse` body.

---

### Story 6.3 — Generate a quiz using general knowledge

**As a** student,
**I want** to generate a quiz on a topic without uploading a document,
**so that** I can study any subject even without course materials.

**Acceptance Criteria:**
- [x] AC-6.3.1: When `outside_sources = true` and no `file_id` is provided, the system generates questions using GPT-4o's general knowledge without retrieving any chunks.
- [x] AC-6.3.2: When `outside_sources = true` and a `file_id` is provided, the system uses both retrieved chunks and GPT-4o's general knowledge. Questions derived from outside the document have `[Outside Source]` prepended to their `explanation`.
- [x] AC-6.3.3: When no `file_id` is provided and `outside_sources = false`, the system generates questions from general knowledge (no 404 is raised — the absence of a file is treated as an outside-sources request).

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | Generate quizzes with or without a `file_id`; choose difficulty and question count | Generate quizzes using another user's `file_id` | FastAPI `get_current_user`; `file_id` ownership validated against `uploaded_files.uploaded_by = auth.uid()` before retrieval |
| Instructor | None in this feature — quiz generation is student-facing | Access `POST /quiz/generate` (role guard) | `ProtectedRoute allowedRole="student"` + optional route-level role check |
| Unauthenticated | None | All actions | FastAPI auth dependency |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** No — generation is ephemeral. The response is returned to the client; the student must explicitly save to persist (see FEAT-007 Quiz Study & Saving).
- **Reads from:** `chunks` table via `match_chunks` RPC (hybrid search); `uploaded_files` for `file_id` ownership check

### 4b. Backend architecture

- **Route:** `backend/app/api/routes/quiz.py` — `POST /quiz/generate`
- **Service:** `backend/app/services/quiz_gen.py` — prompt construction, LLM call, response parsing
- **Retrieval:** `backend/app/services/retrieval.py` — `match_chunks` hybrid search RPC, top 12 chunks
- **Request schema (`QuizRequest`):** `topic` (str, required), `file_id` (uuid, optional), `num_questions` (int, default 5), `difficulty` (`"easy" | "medium" | "hard"`, default `"medium"`), `question_types` (list, optional), `outside_sources` (bool, default false)
- **Response schema (`QuizResponse`):** `questions` (list), `difficulty`, `topic`, `num_questions`
- **Difficulty injection:** difficulty value is looked up in a pre-written dict/map and inserted into the LLM prompt — never f-string interpolated directly from user input
- **Async / sync?** Synchronous FastAPI route; LLM call is awaited inline
- **LLM involvement?** Yes — GPT-4o via `quiz_gen.py`; prompt includes topic, difficulty descriptor, retrieved chunks (if any), and question-type instructions

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/student/Generate.jsx` — topic input, difficulty selector, question count, file selector, outside-sources toggle, generate button, results display
- **State scope:** local component state (form fields, generated questions, loading/error)
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No — embeddings are pre-computed at ingestion time.
- **Affects retrieval query?** Yes — this feature is the primary consumer of `match_chunks` hybrid search. Top-K is fixed at 12.
- **Affects LLM prompt in `quiz_gen.py`?** Yes — difficulty and question type are injected into the prompt via a pre-written descriptor map.

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** Yes — `topic` is user-supplied. It must be passed as a content value in the messages array, not concatenated into a system prompt string. The difficulty descriptor must come from a server-side dict keyed on the validated enum value, not from user input directly.
- **`file_id` access control:** the route must confirm `uploaded_files.uploaded_by = auth.uid()` before passing the `file_id` to the retrieval service. A student must not be able to retrieve chunks from another user's file by supplying an arbitrary UUID.
- **New SQL queries?** No new raw queries — retrieval uses the existing `match_chunks` RPC.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- Saving the generated quiz (FEAT-007 Story 7.2)
- Regenerating a quiz (FEAT-007 Story 7.3)
- Instructor-initiated quiz generation
- Streaming the generation response (the full response is returned in one HTTP reply)
- Storing intermediate generation state server-side
- Per-question `source_chunk_ids` deduplication or ranking beyond what the retrieval service returns

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Is `file_id` ownership validated server-side before the retrieval call, or is it assumed valid from the client? | pipeline | Req-validator must check the quiz route for AC-6.1.2 — if ownership is not enforced, prototyper must add it |
| 2 | Is the difficulty descriptor injected via a dict/map or via direct f-string interpolation? | pipeline | Design-validator must verify this in `quiz_gen.py` — direct interpolation is a MAJOR security finding |
| 3 | What question types are supported and how are they specified in `question_types`? | pipeline | Design-validator should document the accepted values; req-validator should confirm the MCQ/true-false/short-answer split in the response shape (AC-6.1.4) |

---

## 7. Test Boundaries

- **External deps to mock:** `openai.ChatCompletion` (or `AsyncOpenAI`), `supabase.rpc('match_chunks')`, `supabase.from('uploaded_files')`
- **Fixtures needed:** mock chunk list (12 items with `chunk_id`, `text`, `page_numbers`); mock GPT-4o response for MCQ, true/false, and short-answer question types; `uploaded_files` row owned by the test user; `uploaded_files` row owned by a different user (for access-control test)
- **Integration vs. unit boundary:**
  - `POST /quiz/generate` route handler = integration test with mocked retrieval and LLM
  - `quiz_gen.py` prompt builder = unit test asserting difficulty descriptor is from the dict, not interpolated
  - `retrieval.py` `match_chunks` call = unit test asserting top-K=12 and correct `file_id` filter
  - `file_id` ownership check = integration test asserting HTTP 403/404 when `uploaded_by ≠ auth.uid()`
- **Frontend test targets:** `Generate.jsx` — topic field empty blocks submission; difficulty selector sends correct value; `outside_sources` toggle changes request payload; response renders questions in correct format per type
- **Explicitly out of test scope:** live OpenAI API calls, live Supabase hybrid search RPC, live embedding computation

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-006-quiz-generation.md`
