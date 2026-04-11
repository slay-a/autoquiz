# Feature Brief: Class Management (Instructor)

---

## 1. Summary

**Feature:** Class Management — instructors can create classes, view their class list with member counts, and inspect class detail including enrolled students.
**Requested by:** Instructor
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 2.1 — Create a class

**As an** instructor,
**I want** to create a class with a name and optional description,
**so that** I have a space to organise materials and students.

**Acceptance Criteria:**
- [x] AC-2.1.1: The create class form requires a `name` field. The submit button is disabled when `name` is empty or whitespace-only.
- [x] AC-2.1.2: On submission, a row is inserted into `classes` with `name`, `description` (nullable), `instructor_id` set to the current user's ID, and a `class_code` that is exactly 6 uppercase alphanumeric characters.
- [x] AC-2.1.3: `class_code` is unique across all classes. If a collision occurs, a new code is generated.
- [x] AC-2.1.4: The newly created class appears at the top of the instructor's class list immediately after creation, without a full page reload.
- [x] AC-2.1.5: The create class form resets to empty after successful submission.

---

### Story 2.2 — View class list

**As an** instructor,
**I want** to see all the classes I have created along with their member counts,
**so that** I can navigate to the one I want to manage.

**Acceptance Criteria:**
- [x] AC-2.2.1: The instructor dashboard fetches only classes where `instructor_id` equals the current user's ID.
- [x] AC-2.2.2: Each class card displays the class `name`, `description` (if present), `class_code`, and the count of rows in `class_members` for that class.
- [x] AC-2.2.3: Classes are displayed in descending order of `created_at` (newest first).
- [x] AC-2.2.4: Clicking a class card navigates to `/instructor/class/:id`.

---

### Story 2.3 — View class detail

**As an** instructor,
**I want** to see the full detail of a class including its members, files, notes, and quizzes,
**so that** I can manage all class resources from one place.

**Acceptance Criteria:**
- [x] AC-2.3.1: The class detail page (`/instructor/class/:id`) displays the class `name`, `class_code`, and `description`.
- [x] AC-2.3.2: The page shows a list of enrolled students (rows in `class_members` joined to `profiles`).
- [x] AC-2.3.3: The instructor can copy the `class_code` to the clipboard from this page.
- [x] AC-2.3.4: The page provides access to file upload, notes creation, and quiz sharing for the class.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Create classes, view own class list, view own class detail | View or modify classes owned by another instructor | FastAPI `get_current_user` + Supabase RLS on `classes` (instructor_id = auth.uid()) |
| Student | None in this feature | Create classes, access `/instructor/class/:id` | `ProtectedRoute allowedRole="instructor"` + RLS |
| Unauthenticated | None | All actions | `ProtectedRoute` + FastAPI auth dependency |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Tables:**
  - `classes`: `id` (uuid PK), `name` (text), `description` (text nullable), `instructor_id` (uuid FK → auth.users), `class_code` (varchar 6, unique), `created_at`
  - `class_members`: `id`, `class_id` (FK → classes), `student_id` (FK → auth.users), `joined_at`
- **Migration required:** No (already in place)

### 4b. Backend architecture

- **Routes:** `backend/app/api/routes/classes.py` (or similar) — `POST /classes`, `GET /classes`, `GET /classes/{class_id}`
- **Service:** class creation logic (including `class_code` generation and collision retry) lives in a service method
- **`class_code` generation:** random 6-char uppercase alphanumeric string; loop until unique insert succeeds
- **Async / sync:** synchronous FastAPI routes
- **LLM involvement?** No

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/instructor/Dashboard.jsx` — class list + create class form
  - `frontend/src/pages/instructor/ClassView.jsx` — class detail view
- **State scope:** local component state (class list, form fields); no new context
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No
- **Affects embedding?** No
- **Affects retrieval query?** No
- **Affects LLM prompt?** No

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No
- **New SQL queries?** Yes — parameterized queries only; `instructor_id` is always set from the JWT, never from client payload
- **CORS / auth headers affected?** No

---

## 5. Out of Scope

- Student joining a class (Feature Group 3)
- File upload and processing within a class (Feature Group 4)
- Quiz sharing with a class (Feature Group 7)
- Notes creation within a class (Feature Group 9)
- Deleting or archiving classes
- Editing class name or description after creation

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Does the member count query use a join or a separate count endpoint? | pipeline | Req-validator should verify AC-2.2.2 against the actual Dashboard fetch logic |
| 2 | Is class detail fetched in a single query (with members joined) or separate requests? | pipeline | Design-validator should check ClassView data-fetching pattern |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('classes')`, `supabase.from('class_members')`, `navigator.clipboard.writeText`
- **Fixtures needed:** instructor profile, one or more class rows with member counts, `class_members` rows joined to student profiles
- **Integration vs. unit boundary:** route handlers = integration tests with mocked Supabase client; `class_code` generator = unit test
- **Frontend test targets:** `Dashboard.jsx` — create form disabled when name empty, new class prepended after save, form resets; `ClassView.jsx` — displays name/code/description, shows member list, copy-to-clipboard
- **Explicitly out of test scope:** live Supabase writes, live collision resolution in production DB

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-002-class-management.md`
