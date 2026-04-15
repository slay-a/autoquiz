# AutoQuiz — Feature Backlog

> **Purpose:** Canonical list of features to be built, each with status, user stories,
> and a pointer to its detailed spec file. The orchestrator reads this to know what is
> queued and in what order. Agents never modify this file — only the product owner does.
>
> **Status values:** `backlog` | `ready` | `in-progress` | `in-review` | `done`
> **Priority values:** `P0` (must-have) | `P1` (high) | `P2` (nice-to-have)

---

## How agents use this file

- **Orchestrator:** reads the `ready` features in priority order; picks the next one to run
- **Req-validator:** uses the Stories and ACs here as the ground truth for PASS/FAIL verdicts
- **Design-validator:** uses the Dependencies column to check that prerequisite features are stable
- **Prototyper / Tester:** do not read this file directly; they receive the relevant feature's spec file

---

## Feature Index

| ID | Feature | Priority | Status | Spec file | Depends on |
|----|---------|----------|--------|-----------|------------|
| FEAT-001 | Authentication & Session Management | P0 | ready | `specs/feat-001-auth-session.md` | — |
| FEAT-002 | Class Management (Instructor) | P0 | ready | `specs/feat-002-class-management.md` | FEAT-001 |
| FEAT-003 | Class Membership (Student) | P0 | ready | `specs/feat-003-class-membership.md` | FEAT-001 |
| FEAT-004 | LlamaIndex Ingestion Pipeline | P1 | ready | `specs/feat-004-llamaindex-ingestion.md` | FEAT-001 |
| FEAT-005 | File Upload & Processing Pipeline | P0 | ready | `specs/feat-005-file-upload.md` | FEAT-004 |
| FEAT-006 | Quiz Generation | P0 | ready | `specs/feat-006-quiz-generation.md` | FEAT-005 |
| FEAT-007 | Quiz Study & Saving | P0 | ready | `specs/feat-007-quiz-study-saving.md` | FEAT-006 |
| FEAT-008 | Quiz Sharing (Instructor) | P0 | ready | `specs/feat-008-quiz-sharing.md` | FEAT-007 |
| FEAT-009 | Notes Generation (Student) | P1 | ready | `specs/feat-009-notes-generation-student.md` | FEAT-006 |

> Add rows here as features are identified. Move status to `ready` only after the spec
> file is complete and the handoff checklist in that file is checked off.

---

## Feature Details

### FEAT-009 — Notes Generation (Student)

**Stories:** 9.1 Generate study notes, 9.2 Save generated notes
**ACs summary:** Generate button disabled when topic empty; `POST /notes/generate` requires auth (currently missing — MAJOR gap); `file_id` triggers hybrid search top-15 chunks; response contains `summary`, `key_concepts`, `important_details`, `common_misconceptions`; no `file_id` uses general knowledge; Save button appears after generation and inserts into new `student_notes` table with `created_by` from JWT; Save button replaced by confirmation indicator after save; saved notes appear on student dashboard.
**Dependencies:** FEAT-006
**Implementation status:** Story 9.1 partially implemented (route exists, auth guard missing); Story 9.2 not implemented (no save route, no `student_notes` table, Save button not rendered).

---

### FEAT-008 — Quiz Sharing (Instructor)

**Stories:** 8.1 Share a quiz with a class, 8.2 Generate and share a quiz from the class view, 8.3 Delete a shared quiz
**ACs summary:** Class detail page lists all class quizzes each with a share toggle; toggling sets `is_shared` true/false; only `is_shared = true` quizzes appear on student dashboards for enrolled classes; toggle reflects DB state on load; generation from class view saves with `class_id` and `is_shared = false`; `created_by` always from JWT; newly generated quiz appears without reload; delete removes quiz from list and student views.
**Dependencies:** FEAT-007
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-007 — Quiz Study & Saving

**Stories:** 7.1 Study a quiz, 7.2 Save a generated quiz, 7.3 Regenerate a quiz
**ACs summary:** `/quiz/:id` loads from `saved_quizzes` or shows error; MCQ renders A/B/C/D options; answer locks after submit with correct answer and explanation revealed; true/false shows exactly two options; short answer reveals model answer; Save button inserts row with `is_shared=false` and title `{topic} — {difficulty}`, replaced by confirmation indicator after save; saved quiz appears on dashboard; Regenerate replays generation with original params, saves as new row with `(v2)` suffix, navigates to new URL.
**Dependencies:** FEAT-006
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-006 — Quiz Generation

**Stories:** 6.1 Generate a quiz from uploaded material, 6.2 Select difficulty level, 6.3 Generate using general knowledge
**ACs summary:** Empty topic returns HTTP 400; `file_id` triggers hybrid search top-12 chunks; no chunks + `outside_sources=false` returns HTTP 404; response contains `questions` array with required fields per type; `num_questions` honoured (default 5); difficulty accepts only easy/medium/hard (422 otherwise), defaults to medium, reflected in LLM prompt and response body; `outside_sources=true` skips retrieval or blends chunks with general knowledge; `[Outside Source]` prepended to explanations from outside the document.
**Dependencies:** FEAT-005
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-005 — File Upload & Processing Pipeline

**Stories:** 5.1 Upload a document, 5.2 Track processing status
**ACs summary:** Upload accepts only `.pdf`/`.docx`/`.pptx`; files > 50MB rejected with HTTP 413; file stored in Supabase Storage at `{file_id}/{filename}`; row inserted into `uploaded_files` and `processing_jobs` with `status='queued'`; client polls `GET /upload/status/{job_id}`; status progresses `queued → in_progress → success|failed`; stage reflects pipeline step; `updated_at` auto-refreshed by DB trigger.
**Dependencies:** FEAT-004
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-004 — LlamaIndex Ingestion Pipeline

**Stories:** 4.1 LlamaIndex-based document parsing, 4.2 SentenceSplitter chunking, 4.3 TextNode → chunks table mapping
**ACs summary:** `parsers.py` uses LlamaIndex readers; old custom parse functions removed; `ingestion.py` uses `SentenceSplitter` with settings-configured token size/overlap; old `clean_text`/`detect_sections`/`chunk_sections` removed; `ingest_document` returns same dict shape as before; `page_numbers` and `section_title` mapped from node metadata; no LlamaIndex vector store classes used.
**Dependencies:** FEAT-001
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-003 — Class Membership (Student)

**Stories:** 3.1 Join a class, 3.2 View class content as a student
**ACs summary:** Join button disabled when input empty; case-insensitive code lookup inserts into `class_members`; error on bad code; no duplicate insert with appropriate message; new class prepends without reload; student dashboard shows only `is_shared = true` quizzes and `is_published = true` notes from joined classes, each labelled with class name, with correct nav targets.
**Dependencies:** FEAT-001
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-002 — Class Management (Instructor)

**Stories:** 2.1 Create a class, 2.2 View class list, 2.3 View class detail
**ACs summary:** Create form disabled when name empty; inserts into `classes` with 6-char unique `class_code`; new class prepends to list without reload; form resets; dashboard fetches only instructor's own classes with member counts ordered newest-first; detail page shows name/code/description/members with clipboard copy.
**Dependencies:** FEAT-001
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-001 — Authentication & Session Management

**Stories:** 1.1 Registration, 1.2 Login, 1.3 Session persistence, 1.4 Logout, 1.5 Role-based access control
**ACs summary:** Registration inserts into `profiles` and redirects by role; login checks credentials and redirects; session restored from `aq_profile` in localStorage; logout clears session and blocks protected routes; `ProtectedRoute` enforces role and auth state.
**Dependencies:** none
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

## Conventions for writing new entries

1. **ID:** sequential `FEAT-NNN`
2. **Stories:** `As a [instructor|student], I want [action], so that [outcome]`
3. **ACs in this file:** brief summaries only — full verifiable ACs live in the spec file
4. **Dependencies:** list feature IDs that must be `done` before this one starts
5. **Spec file:** create the file (from `specs/_TEMPLATE.md`) before setting status to `ready`
