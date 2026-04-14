# Feature Brief: Quiz Sharing (Instructor)

---

## 1. Summary

**Feature:** Instructors can share quizzes they generate in a class context with all enrolled students. A share toggle on the class detail page sets `is_shared = true` on a `saved_quizzes` row; students in that class immediately see the quiz on their dashboard.
**Requested by:** Instructor
**Priority:** High

This feature is already implemented. This spec exists to onboard it into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 8.1 — Share a quiz with a class

**As an** instructor,
**I want** to share a saved quiz with my class,
**so that** students can access and study it from their dashboard.

**Acceptance Criteria:**
- [ ] AC-8.1.1: The class detail page (`/instructor/class/:id`) displays all quizzes associated with that class (rows in `saved_quizzes` where `class_id` matches). Each quiz entry has a share toggle button.
- [ ] AC-8.1.2: Clicking the share toggle on a quiz that has `is_shared = false` sets `is_shared = true` in `saved_quizzes`. Clicking it again on a quiz with `is_shared = true` sets `is_shared = false`.
- [ ] AC-8.1.3: Only quizzes with `is_shared = true` and the correct `class_id` appear on the student dashboard for enrolled students. A quiz with `is_shared = false` must never appear in any student view.
- [ ] AC-8.1.4: The share toggle visually reflects the current `is_shared` state when the class detail page loads (not just after a toggle action).

---

### Story 8.2 — Generate and share a quiz from the class view

**As an** instructor,
**I want** to generate a quiz from within the class view and share it directly with enrolled students,
**so that** I do not have to leave the class context to create quiz content.

**Acceptance Criteria:**
- [ ] AC-8.2.1: The class detail page provides a quiz generation form. Submitting it calls `POST /quiz/generate` and saves the result as a row in `saved_quizzes` with `class_id` set to the current class and `is_shared = false` by default.
- [ ] AC-8.2.2: The newly generated quiz appears in the class quiz list immediately after generation, without a full page reload.
- [ ] AC-8.2.3: `created_by` is set from the authenticated instructor's JWT — never from client payload.
- [ ] AC-8.2.4: The quiz count in the class summary header updates to reflect the newly generated quiz.

---

### Story 8.3 — Delete a shared quiz

**As an** instructor,
**I want** to delete a quiz I created for a class,
**so that** I can remove content that is no longer relevant.

**Acceptance Criteria:**
- [ ] AC-8.3.1: Each quiz entry in the class detail view has a delete button. Clicking it removes the row from `saved_quizzes`.
- [ ] AC-8.3.2: After deletion, the quiz is removed from the class quiz list without a full page reload.
- [ ] AC-8.3.3: After deletion, the quiz no longer appears on any student dashboard.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Generate, share/unshare, and delete quizzes for their own classes | Toggle sharing on quizzes they did not create; access another instructor's class | Supabase RLS on `saved_quizzes` (`created_by = auth.uid()` for UPDATE/DELETE); `ProtectedRoute allowedRole="instructor"` |
| Student | Read quizzes where `is_shared = true` from joined classes | Read, modify, or delete quizzes not shared with them; access instructor class view | Supabase RLS on `saved_quizzes` (SELECT: `created_by = auth.uid() OR is_shared = true`); `ProtectedRoute allowedRole="student"` |
| Unauthenticated | None | All actions | `ProtectedRoute` + FastAPI `get_current_user` dependency |

> The RLS UPDATE policy (`created_by = auth.uid()`) means instructors can only toggle `is_shared` on quizzes they personally created. This is by design: in the class view, all quizzes are instructor-created.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Table:** `saved_quizzes` (existing)
  - Relevant columns: `class_id` (uuid FK → `classes`), `is_shared` (bool, default `false`), `created_by` (uuid FK → `auth.users`)
- **Migration required:** No — `class_id` and `is_shared` columns are already present in the schema
- **No new table:** sharing state lives on the quiz row itself; no junction table needed

### 4b. Backend architecture

- **Share toggle:** Implemented client-side via direct Supabase JS call — no dedicated FastAPI route exists for toggling `is_shared`. The Supabase RLS UPDATE policy enforces that only the quiz owner can update.
- **Quiz generation (class context):** Instructor calls `POST /quiz/generate` (FEAT-006 route) from the class view; the frontend then inserts the result into `saved_quizzes` with `class_id` attached. No new backend route for class-scoped generation.
- **Student content delivery:** `GET /classes/student/content` in `backend/app/api/routes/classes.py` filters `saved_quizzes` by `class_id IN (joined classes) AND is_shared = true`. This is the sole delivery path; students never query `saved_quizzes` directly.
- **Delete:** Client-side Supabase call (`.delete().eq("id", quiz.id)`); RLS DELETE policy enforces ownership.
- **Async / sync?** Synchronous — no background tasks involved.
- **LLM involvement?** Indirectly — generation delegates to FEAT-006 (`POST /quiz/generate`).

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/instructor/ClassView.jsx` — quiz list with share toggle, delete button, quiz generation form, shared quiz count in summary header
  - `frontend/src/pages/student/Dashboard.jsx` — displays shared quizzes from joined classes via `GET /classes/student/content`
- **Share toggle state:** Local component state (`quizzes` array, updated optimistically after a successful Supabase update)
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No.
- **Affects LLM prompt?** No.

### 4e. Security considerations

- **RLS UPDATE scope:** The `saved_quizzes_update` policy restricts updates to `created_by = auth.uid()`. The share toggle must NOT be exploitable by a student to set `is_shared = false` on someone else's quiz — RLS prevents this, but the req-validator should confirm the policy is in place and active.
- **`created_by` source:** Must always come from the server-side JWT, never from the client payload (AC-8.2.3). The generation flow inserts `created_by: user.id` from the authenticated Supabase session — confirm this is set from the Supabase client session rather than a user-supplied field.
- **Student view isolation:** `GET /classes/student/content` must only return quizzes whose `class_id` is in the set of classes the requesting student has joined. An unenrolled student must not receive shared quizzes from a class they haven't joined.
- **New SQL queries?** No new raw SQL — all reads/writes go through Supabase JS client or Supabase Python client with parameterized queries.
- **CORS / auth headers affected?** No.

---

## 5. Out of Scope

- Sharing quizzes across multiple classes simultaneously (a quiz has exactly one `class_id`)
- Sharing student-generated quizzes (only instructor-created quizzes in a class context are shareable via this feature)
- Per-student visibility controls (sharing is all-or-nothing for the enrolled class)
- Quiz analytics or tracking which students have studied a shared quiz
- Expiring or time-limited sharing
- Sharing notes (covered by FEAT-010)

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Does the Supabase `saved_quizzes_update` RLS policy allow an instructor to toggle `is_shared` on a quiz whose `class_id` matches their class but `created_by` is a different user? | pipeline | By current schema, UPDATE is gated to `created_by = auth.uid()` — this means only the quiz creator can toggle. In the class view all quizzes are instructor-created, so this should be fine. Req-validator must confirm no cross-ownership gap exists. |
| 2 | Does the student content route (`GET /classes/student/content`) validate that the student is actually a member of the class before returning its quizzes? | pipeline | The route fetches memberships by `student_id = current_user["id"]` and restricts to those `class_id`s — this appears correct but req-validator should confirm no bypass is possible. |
| 3 | Is there a "Shared Quizzes" count displayed in the class summary header, and does it update after toggling? | pipeline | ClassView.jsx derives `sharedQuizzes` from local state — should update immediately after toggle. Design-validator should confirm. |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('saved_quizzes')` (select, update, delete), `GET /classes/student/content` (backend route), `POST /quiz/generate` (for AC-8.2.1)
- **Fixtures needed:**
  - An instructor with a class containing 2 quizzes: one `is_shared = true`, one `is_shared = false`
  - A student enrolled in that class
  - A second student NOT enrolled in that class
  - A second instructor with their own class (to verify cross-class isolation)
- **Integration vs. unit boundary:**
  - `GET /classes/student/content` = integration test — verify `is_shared = false` quizzes are absent; verify unenrolled student gets no quizzes
  - Toggle share = frontend component test — verify toggle calls Supabase update with correct payload and UI state flips
  - Delete = frontend component test — verify quiz is removed from local state after delete
- **Frontend test targets:**
  - `ClassView.jsx` — share toggle renders with correct initial state; clicking toggle fires update; visual indicator changes after toggle; delete removes entry from list
  - `Dashboard.jsx` (student) — only `is_shared = true` quizzes from joined classes are displayed; quizzes from non-joined classes are absent
- **Explicitly out of test scope:** live Supabase RLS enforcement (requires live DB), live OpenAI generation calls
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-008-quiz-sharing.md`
