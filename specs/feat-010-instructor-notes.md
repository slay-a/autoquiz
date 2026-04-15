# Feature Brief: Instructor Notes System

---

## 1. Summary

**Feature:** Instructors generate AI-structured study notes within a class, edit the generated content, and publish or unpublish each note to control student visibility. Students access published notes from their dashboard via `/class-note/:id`.
**Requested by:** Instructor
**Priority:** High

This feature is already implemented. This spec exists to onboard it into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 10.1 — Create class notes

**As an** instructor,
**I want** to create structured notes for a class topic,
**so that** I can share curated study material with my students.

**Acceptance Criteria:**
- [ ] AC-10.1.1: From the class detail page, the instructor can initiate note creation by entering a `topic`. The Generate button is disabled when the topic field is empty or whitespace-only.
- [ ] AC-10.1.2: Submitting the form triggers `POST /notes/generate` (with a valid auth token) and saves the result as a row in `class_notes` with `class_id`, `created_by`, `title` (set to the topic), `topic`, `content` (the generated notes object), and `is_published = false`.
- [ ] AC-10.1.3: Newly created notes appear at the top of the class notes list immediately, without a full page reload.

---

### Story 10.2 — Edit class notes

**As an** instructor,
**I want** to edit the content of notes I have created for a class,
**so that** I can correct or expand on the AI-generated content before sharing it.

**Acceptance Criteria:**
- [ ] AC-10.2.1: Each note in the class detail view has an Edit button. Clicking it opens an inline editor in place of the note's read view.
- [ ] AC-10.2.2: The editor allows modification of `title`, `summary`, each entry in `key_concepts` (`term`, `definition`, `example`), each item in `important_details`, and each item in `common_misconceptions`.
- [ ] AC-10.2.3: The instructor can add new `key_concepts`, `important_details`, and `common_misconceptions` items, and can remove existing items from any of these three fields.
- [ ] AC-10.2.4: Clicking Save updates the `class_notes` row with the new `title` and `content`. Clicking Cancel discards all changes and returns to the list view without modifying the database.

---

### Story 10.3 — Publish and unpublish class notes

**As an** instructor,
**I want** to control whether students can see a set of class notes,
**so that** I can prepare materials before making them available.

**Acceptance Criteria:**
- [ ] AC-10.3.1: Each note has a Publish/Unpublish toggle button. Activating it sets `is_published = true` in `class_notes`; deactivating sets `is_published = false`. The toggle reflects an in-progress state (spinner) while the update is pending.
- [ ] AC-10.3.2: Notes with `is_published = false` do not appear on any student dashboard or accessible class note view. A student who navigates to `/class-note/:id` for an unpublished note must receive an appropriate error or not-found response — not the note content.
- [ ] AC-10.3.3: Notes with `is_published = true` appear on the student dashboard under the Class Notes tab (for enrolled students) and are fully accessible at `/class-note/:id`.
- [ ] AC-10.3.4: The toggle's visual state (Published / Draft badge and button label) reflects the current `is_published` value from the database on every page load, not only after a toggle interaction.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Generate, edit, publish/unpublish, and delete notes for their own classes | Generate or modify notes in classes they do not own; read unpublished notes from other classes | `ProtectedRoute allowedRole="instructor"`; Supabase RLS on `class_notes` should restrict writes to `created_by = auth.uid()` (currently `auth_all` — gap) |
| Student | Read notes where `is_published = true` from joined classes | Read unpublished notes; create, edit, or delete any note | `ProtectedRoute allowedRole="student"`; `ClassNoteView.jsx` must check `is_published` (currently missing — gap); `GET /classes/student/content` filters `is_published = true` |
| Unauthenticated | None | All actions | `ProtectedRoute` (no role) wraps `/class-note/:id`; FastAPI `get_current_user` on `POST /notes/generate` |

> **RLS gap:** `class_notes` currently uses the permissive `auth_all` policy — any authenticated user can read, insert, update, or delete any note. This must be tightened: writes restricted to `created_by = auth.uid()`; reads restricted to `created_by = auth.uid() OR is_published = true`.
>
> **Published check gap:** `ClassNoteView.jsx` fetches the note by ID without checking `is_published`. A student who knows the note ID can read a draft note because the Supabase client call has no `is_published = true` filter and RLS does not enforce it.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Table:** `class_notes` (existing)
  - `id` (uuid PK), `class_id` (uuid FK → `classes`, not null), `created_by` (uuid FK → `profiles`, not null), `title` (text), `topic` (text), `file_id` (text nullable), `content` (jsonb), `is_published` (bool, default `false`), `created_at`, `updated_at`
- **Migration required:** No schema changes needed — the `updated_at` trigger (`notes_updated_at`) already exists. RLS policy replacement is needed (see §4e).
- **Title behaviour:** In the current implementation, `title` and `topic` are both set to the instructor's topic input — there is no separate title field in the create form. The editor allows the title to be changed independently after creation.

### 4b. Backend architecture

- **Generate route:** `POST /notes/generate` in `backend/app/api/routes/notes.py` — protected by `get_current_user`. Returns the notes object; the frontend inserts into `class_notes` via the Supabase JS client.
- **No dedicated FastAPI route for save/publish/delete:** All `class_notes` CRUD goes directly through the Supabase JS client in `ClassView.jsx`. There is no FastAPI intermediary for these operations.
- **Student delivery:** `GET /classes/student/content` in `backend/app/api/routes/classes.py` returns `class_notes` rows filtered by `class_id IN (joined classes) AND is_published = true`. This is the correct delivery path.
- **Async / sync?** `POST /notes/generate` is async; all other operations are synchronous Supabase client calls.
- **LLM involvement?** Yes — `POST /notes/generate` calls `notes_gen.generate_notes()` via GPT-4o. No changes to the generation logic are required.

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/instructor/ClassView.jsx` — notes tab: list with Publish/Draft badge, Edit button, Delete button, Generate Note button; inline `NoteEditor` component for editing; generate form with file picker and topic input
  - `frontend/src/pages/ClassNoteView.jsx` — student read view at `/class-note/:id`; must add `is_published` check so unpublished notes return an error state
  - `frontend/src/pages/student/Dashboard.jsx` — Class Notes tab populated via `GET /classes/student/content`
- **`NoteEditor`:** Inline component defined in `ClassView.jsx` — handles title, summary, key_concepts (add/edit/remove each: term, definition, example), important_details (add/edit/remove), and common_misconceptions (add/edit/remove)
- **State scope:** Local component state in `ClassView.jsx` (`notes`, `editingNote`, `savingNote`, `publishingNoteId`, `deletingNoteId`, `noteView`, `noteGenTopic`, `noteGenFileId`)
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No — `POST /notes/generate` calls `hybrid_search` with `top_k=15`, unchanged.
- **Affects LLM prompt in `notes_gen.py`?** No changes required.

### 4e. Security considerations

- **`class_notes` RLS is `auth_all` (MAJOR gap):** The current policy allows any authenticated user full read/write access to all `class_notes` rows. Required replacement:
  - `SELECT`: `created_by = auth.uid() OR is_published = true` (instructors see their own notes including drafts; students see only published notes)
  - `INSERT`: `created_by = auth.uid()` — note creator must be the auth user
  - `UPDATE / DELETE`: `created_by = auth.uid()` — only the note creator can modify or delete
- **`ClassNoteView.jsx` published check missing:** The component fetches `class_notes` by ID with no `is_published` filter. Must add a check: if `note.is_published === false`, show an appropriate error state rather than the note content. Once the RLS SELECT policy is tightened this becomes a defence-in-depth check, but the component check is needed while the permissive policy is in place.
- **`created_by` source:** Notes creation uses `user.id` from `useAuth()` (the Supabase JS client auth session). This is acceptable — it is equivalent to sourcing from the authenticated session, not a user-supplied field.
- **No user-controlled data in LLM prompts beyond `topic`:** The topic field is interpolated into the prompt in `notes_gen.py` — same pattern as `quiz_gen.py`. Design-validator should apply the same assessment as for quiz generation.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- Student-generated personal notes (covered by FEAT-009)
- Deleting class notes (implemented but not part of the user stories — treat as bonus behaviour; do not remove)
- Per-student visibility controls (publish is all-or-nothing for the enrolled class)
- Notes versioning or draft history
- Sharing notes across multiple classes (a note belongs to exactly one `class_id`)
- Rich-text or markdown formatting in the editor (plain text fields only)

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Should `ClassNoteView.jsx` enforce the `is_published` check at the component level, at the RLS level, or both? | pipeline | Both — RLS is the primary enforcement; component-level check is defence-in-depth. Fix RLS first, then add the component check. |
| 2 | The create form sets `title = topic` — should the spec require a distinct title field, or is topic-as-title acceptable? | pipeline | Topic-as-title is acceptable for creation; the editor allows the title to be changed afterwards. Req-validator should not treat the absence of a separate create-time title field as a failure. |
| 3 | Does the `GET /classes/student/content` route already filter `class_notes` by `class_id IN (student's joined classes) AND is_published = true`? | pipeline | Yes — confirmed in `backend/app/api/routes/classes.py`. Req-validator should verify this is correct for the enrolled-only constraint. |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('class_notes')` (select, insert, update, delete), `POST /notes/generate`, `GET /classes/student/content`
- **Fixtures needed:**
  - An instructor with a class containing: one published note, one draft note
  - A student enrolled in that class
  - A student NOT enrolled in that class
  - A note ID belonging to a different instructor's class
- **Integration vs. unit boundary:**
  - `GET /classes/student/content` = integration test — draft notes absent; notes from non-joined classes absent
  - `POST /notes/generate` auth guard = integration test — HTTP 401 when unauthenticated
  - `ClassNoteView.jsx` published check = component test — unpublished note ID renders error state, not note content
  - `NoteEditor` = component unit test — all editable fields update state; add/remove for concepts and list items
- **Frontend test targets:**
  - `ClassView.jsx` — Generate button disabled when topic empty; new note prepends after generation; Publish toggle flips badge label; Edit opens NoteEditor; Cancel discards without save; Save updates note in list
  - `ClassNoteView.jsx` — renders note content for published note; renders error/not-found for unpublished note
  - `Dashboard.jsx` (student) — class notes tab shows only published notes from joined classes
- **Explicitly out of test scope:** live OpenAI calls, live Supabase writes, RLS enforcement against a live DB
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-010-instructor-notes.md`
