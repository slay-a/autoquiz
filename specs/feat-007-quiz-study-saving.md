# Feature Brief: Quiz Study & Saving

---

## 1. Summary

**Feature:** Quiz study and saving — students open a saved quiz and answer its questions interactively, save a freshly generated quiz for later use, and regenerate a new version of any quiz on the same topic with a single click.
**Requested by:** Student
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 7.1 — Study a quiz

**As a** student,
**I want** to open a saved quiz and answer its questions,
**so that** I can test my knowledge.

**Acceptance Criteria:**
- [x] AC-7.1.1: The quiz study page (`/quiz/:id`) loads the quiz from `saved_quizzes` by ID. If the ID does not exist, the page shows an appropriate message.
- [x] AC-7.1.2: MCQ questions display all answer options labelled A, B, C, D. The student can select one option per question while the quiz is in progress.
- [x] AC-7.1.3: True/false questions present exactly two options: `True` and `False`.
- [x] AC-7.1.4: Short-answer questions display an input field. They are not auto-graded — see Story 7.4 for self-assessment semantics.
- [x] AC-7.1.5: A single `Submit Quiz` button is presented after the last question. It is enabled once at least one question has been answered, and submitting it locks all answer inputs simultaneously, reveals the model answer + explanation for every question, and surfaces the score banner described in Story 7.4.
- [x] AC-7.1.6: Before submission, the page displays a running counter of `answered/total` questions.

---

### Story 7.2 — Save a generated quiz

**As a** student,
**I want** to save a quiz I have just generated,
**so that** I can return to it later or share it.

**Acceptance Criteria:**
- [x] AC-7.2.1: After a quiz is generated, a Save button is available. Clicking it inserts a row into `saved_quizzes` with `title`, `topic`, `difficulty`, `file_id` (nullable), `created_by`, `questions`, and `is_shared = false`.
- [x] AC-7.2.2: The `title` is auto-generated in the format `{topic} — {difficulty}`.
- [x] AC-7.2.3: The Save button is replaced by a confirmation indicator after successful save. It is not clickable again for the same quiz.
- [x] AC-7.2.4: The saved quiz appears on the student dashboard under the quizzes tab.

---

### Story 7.3 — Regenerate a quiz

**As a** student,
**I want** to regenerate a new version of a quiz on the same topic,
**so that** I get fresh questions to avoid memorising answers.

**Acceptance Criteria:**
- [x] AC-7.3.1: The quiz study page provides a Regenerate button. Clicking it sends a new `POST /quiz/generate` request using the same `topic`, `num_questions`, `difficulty`, `question_types`, `outside_sources`, and `file_id` as the original quiz.
- [x] AC-7.3.2: On success, the regenerated quiz is saved as a new row in `saved_quizzes` with `title` suffixed `(v2)`.
- [x] AC-7.3.3: The page navigates to the new quiz's URL (`/quiz/:new_id`) after saving.

---

### Story 7.4 — See score and self-assess after submission

**As a** student,
**I want** to see how I scored on auto-graded questions and to self-assess my short-answer responses,
**so that** I know what I got right, what I missed, and which questions to convert into flashcards for further review.

**Acceptance Criteria:**
- [ ] AC-7.4.1: On submission, a violet score banner displays `correct/total_graded` over auto-graded questions only (MCQ + true/false). The banner copy varies by score band: 100% → "Perfect!", ≥80% → "Great job!", ≥50% → "Keep studying!", below 50% → "Review and try again".
- [ ] AC-7.4.2: A trophy badge in the page header shows the same `correct/total_graded` ratio and toggles the score banner visibility on click.
- [ ] AC-7.4.3: When at least one short-answer question is present, the banner footer notes that those questions are for self-review and not counted in the score.
- [ ] AC-7.4.4: After submission, each short-answer card exposes an "I got this right" / "I got this wrong" toggle. The toggle is the only way a short-answer question is added to the wrong-pool for flashcard conversion (see Story 7.5).
- [ ] AC-7.4.5: All scoring is computed client-side. No `/quiz/:id/submit` or `/quiz/:id/grade` endpoint exists.

---

### Story 7.5 — Convert wrong answers to flashcards

**As a** student,
**I want** to turn the questions I got wrong into a flashcard set,
**so that** I can drill on my weak spots without re-taking the whole quiz.

**Acceptance Criteria:**
- [ ] AC-7.5.1: After submission, when at least one MCQ/TF question is wrong OR at least one short-answer question is self-marked wrong, a "Convert N wrong answers to flashcards" CTA appears both in the score banner and as a header badge.
- [ ] AC-7.5.2: Clicking the CTA creates a row in `flashcard_sets` linked to the source quiz (`quiz_id`) with one card per wrong question (`front` = question, `back` = model answer, `explanation` = explanation).
- [ ] AC-7.5.3: After creation, the page navigates to `/flashcards/:new_id`.
- [ ] AC-7.5.4: The CTA is hidden when there are no wrong questions to convert.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | Load, study, save, and regenerate their own quizzes; study quizzes shared by an instructor | Load or modify quizzes owned by another student | Supabase RLS on `saved_quizzes` (`created_by = auth.uid()` for write; `is_shared = true` for cross-user read) |
| Instructor | None in this feature — study and saving are student-facing | Save or regenerate quizzes via this flow | `ProtectedRoute allowedRole="student"` |
| Unauthenticated | None | All actions | `ProtectedRoute` + FastAPI auth dependency |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Table:** `saved_quizzes`
  - `id` (uuid PK), `title` (text), `topic` (text), `difficulty` (text), `file_id` (uuid nullable FK → uploaded_files), `created_by` (uuid FK → auth.users), `questions` (jsonb), `is_shared` (bool, default false), `created_at`
- **Migration required:** No (already in place)
- **Title format:** `{topic} — {difficulty}` generated client-side or server-side before insert; `(v2)` suffix appended for regenerated quizzes

### 4b. Backend architecture

- **Save route:** `POST /quiz/save` (or equivalent) — inserts into `saved_quizzes`; `created_by` set from JWT; `is_shared` hardcoded to `false` on creation
- **Load route:** `GET /quiz/{id}` — fetches row from `saved_quizzes` by ID; returns 404 if not found
- **Regenerate flow:** client calls `POST /quiz/generate` with the original quiz's parameters, then saves the result as a new `saved_quizzes` row with title suffixed `(v2)` — no dedicated regenerate endpoint required
- **Async / sync?** Synchronous FastAPI routes for save and load; regenerate reuses the generation route
- **LLM involvement?** No for save/load; yes for regenerate (delegates to FEAT-006 quiz generation)

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/student/Generate.jsx` — Save button after generation; confirmation indicator state
  - `frontend/src/pages/student/Quiz.jsx` (or `/quiz/:id`) — question rendering per type, answer submission, reveal logic, Regenerate button, navigation to new quiz URL
  - `frontend/src/pages/student/Dashboard.jsx` — saved quizzes appear under quizzes tab
- **Answer lock:** the entire quiz locks atomically when the single `Submit Quiz` button is pressed; per-question selection cannot change after that point. Enforced purely in frontend state (no server round-trip required).
- **Scoring:** computed client-side from MCQ + true/false answers only. Short-answer self-assessment toggles modify only the wrong-pool used by the flashcard CTA, never the displayed score.
- **State scope:** local component state (current answers, submitted flags, self-assess toggles, loading); no new context
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No — regenerate delegates to FEAT-006 which owns retrieval.
- **Affects LLM prompt?** No — quiz_gen.py is unchanged by this feature.

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No for save/load. Regenerate reuses FEAT-006 which already handles prompt security.
- **New SQL queries?** Yes — `saved_quizzes` insert and select use parameterized queries; `created_by` always sourced from JWT.
- **Cross-user read:** a student must only be able to load a quiz by ID if `created_by = auth.uid()` OR `is_shared = true`. A raw ID lookup without this filter is an access-control gap.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- Editing or deleting a saved quiz
- Incrementing version suffix beyond `(v2)` (e.g., v3, v4) in this iteration
- Auto-grading of short-answer questions (deferred — see Story 7.4 self-assessment)
- Server-side scoring or persisted attempt history (scoring is client-side, not stored)
- Sharing a quiz with a class (FEAT-008 Quiz Sharing)
- Progress tracking across multiple attempts at the same quiz

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Is the quiz load route (`GET /quiz/{id}`) gated so that a student can only load quizzes they own or that are `is_shared = true`? | pipeline | Req-validator must check for this access control — absence is a MAJOR gap |
| 2 | Is the `(v2)` suffix applied before or after the save call, and is it client-side or server-side? | pipeline | Design-validator should verify AC-7.3.2 against the regenerate flow implementation |
| 3 | Does the student dashboard quizzes tab fetch all `saved_quizzes` for the user, or only a subset? | pipeline | Req-validator should verify AC-7.2.4 — newly saved quiz must appear without reload |
| 4 | Why is short-answer self-assessed rather than auto-graded? | product | LLM grading was rejected on cost; exact-match was rejected as too brittle; self-assessment fits the review-tool positioning and matches active-learning practice. |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('saved_quizzes')` (insert, select by ID), `POST /quiz/generate` (for regenerate flow)
- **Fixtures needed:** `saved_quizzes` rows with MCQ, true/false, and short-answer question types; a row with `is_shared = true` owned by a different user; a non-existent quiz ID
- **Integration vs. unit boundary:**
  - Save route = integration test asserting correct insert shape (`is_shared = false`, `created_by = auth.uid()`, title format)
  - Load route = integration test asserting 404 on missing ID and access-control enforcement
  - Regenerate flow = integration test asserting new row created with `(v2)` suffix and navigation to new URL
- **Frontend test targets:**
  - `Quiz.jsx` — MCQ renders A/B/C/D options; answer locks after submit; correct answer and explanation revealed; true/false renders exactly two options; short answer reveals model answer on submit; not-found ID shows error message
  - `Generate.jsx` — Save button present after generation; replaced by confirmation indicator after save; not clickable again
  - Regenerate button triggers new generation request with original parameters; page navigates to `/quiz/:new_id`
- **Explicitly out of test scope:** live OpenAI calls (regenerate), live Supabase writes, scoring logic

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-007-quiz-study-saving.md`
