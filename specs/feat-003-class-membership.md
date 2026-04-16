# Feature Brief: Class Membership (Student)

---

## 1. Summary

**Feature:** Class Membership — students can join a class by code and view shared quizzes and published notes from their enrolled classes.
**Requested by:** Student
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 3.1 — Join a class

**As a** student,
**I want** to join a class by entering a class code,
**so that** I can access the materials and quizzes my instructor has shared.

**Acceptance Criteria:**
- [x] AC-3.1.1: The student dashboard provides an input field and button to join a class by `class_code`. The button is disabled when the input is empty.
- [x] AC-3.1.2: On submission, the system looks up `classes` where `class_code` matches the input (case-insensitive). If found, a row is inserted into `class_members` with `class_id` and `student_id`.
- [x] AC-3.1.3: If the class code does not match any class, the UI displays an error message; the student is not redirected.
- [x] AC-3.1.4: If the student is already a member of the class, the system does not insert a duplicate row and displays an appropriate message.
- [x] AC-3.1.5: After successfully joining, the new class appears in the student's class list without a full page reload.

---

### Story 3.2 — View class content as a student

**As a** student,
**I want** to see the quizzes and notes my instructor has shared for each class I'm in,
**so that** I can study the assigned materials.

**Acceptance Criteria:**
- [x] AC-3.2.1: The student dashboard displays only quizzes from joined classes where `is_shared = true`. Quizzes with `is_shared = false` are never shown to students.
- [x] AC-3.2.2: The student dashboard displays only notes from joined classes where `is_published = true`. Unpublished notes are never shown to students.
- [x] AC-3.2.3: Each shared quiz and published note is labelled with the name of the class it belongs to.
- [x] AC-3.2.4: Clicking a shared quiz navigates to `/quiz/:id`. Clicking a published note navigates to `/class-note/:id`.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | Join a class by code; view shared quizzes and published notes from joined classes | View quizzes with `is_shared = false`; view notes with `is_published = false`; access other students' memberships | Supabase RLS on `class_members` (student_id = auth.uid()) + query-level `is_shared`/`is_published` filters |
| Instructor | None in this feature | Join a class as a student | `ProtectedRoute allowedRole="student"` |
| Unauthenticated | None | All actions | `ProtectedRoute` + FastAPI auth dependency |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Tables:**
  - `class_members`: `id`, `class_id` (FK → classes), `student_id` (FK → auth.users), `joined_at`
  - Reads from `classes` (for code lookup), `saved_quizzes` (for `is_shared`), `class_notes` (for `is_published`)
- **Duplicate prevention:** enforced by a unique constraint on `(class_id, student_id)` in `class_members` or handled gracefully via upsert / error catch
- **Migration required:** No (already in place)

### 4b. Backend architecture

- **Class code lookup:** case-insensitive query on `classes.class_code`; returns `class_id` used to insert into `class_members`
- **Content visibility:** queries for shared quizzes and published notes filter by the student's membership set — never expose rows outside joined classes
- **Async / sync:** synchronous FastAPI routes
- **LLM involvement?** No

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/student/Dashboard.jsx` — join-class input, class list, shared quiz list, published notes list
- **State scope:** local component state (join input, class list, quiz/note lists); no new context
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No
- **Affects embedding?** No
- **Affects retrieval query?** No
- **Affects LLM prompt?** No

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No
- **New SQL queries?** Yes — `class_code` lookup uses parameterized query; `student_id` always sourced from JWT, never from client payload
- **Duplicate row prevention:** must not rely solely on client-side checks — DB constraint or server-side guard required
- **CORS / auth headers affected?** No

---

## 5. Out of Scope

- Leaving or being removed from a class
- Viewing class members as a student
- Instructor joining a class as a student
- Creating or editing quizzes/notes from the student dashboard (separate features)
- Pagination of the class list, quiz list, or note list

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Is the class code lookup strictly case-insensitive (e.g., `ilike`) or does the UI normalize to uppercase before submission? | pipeline | Req-validator should verify AC-3.1.2 against the actual query and/or input handler |
| 2 | How is the duplicate-member case surfaced — DB unique constraint error caught server-side, or a pre-check query? | pipeline | Design-validator should check the join route's error handling path |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('classes')`, `supabase.from('class_members')`, `supabase.from('saved_quizzes')`, `supabase.from('class_notes')`
- **Fixtures needed:** student profile; one class row with `class_code`; `class_members` rows; `saved_quizzes` rows with `is_shared = true` and `is_shared = false`; `class_notes` rows with `is_published = true` and `is_published = false`
- **Integration vs. unit boundary:** join-class route handler = integration test with mocked Supabase; dashboard content filtering = integration test verifying `is_shared`/`is_published` filters; join button disabled state = component unit test
- **Frontend test targets:** `Dashboard.jsx` — join button disabled when input empty; error message on bad code; error/no-duplicate message on already-joined; new class prepended after success; `is_shared = false` quizzes absent; `is_published = false` notes absent; class name label present on each item; correct navigation targets
- **Explicitly out of test scope:** live Supabase writes, real class code collision

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-003-class-membership.md`
