# Feature Brief: [Feature Name]

> **Instructions:** Fill out every section before handing this brief to the orchestrator.
> Delete instructional callouts (blockquotes) when done.
> Save this file as `specs/<feature-slug>.md`.

---

## 1. Summary

> One or two sentences. What does this feature do and why does it exist?

**Feature:** <!-- e.g., "Difficulty level selection for quiz generation" -->
**Requested by:** <!-- Instructor / Student / Internal -->
**Priority:** <!-- High / Medium / Low -->

---

## 2. User Stories

> Write one story per distinct actor action. Each story must have explicit acceptance criteria —
> these are the exact statements `autoquiz-req-validator` will verify against the implementation.

### Story 1 — [Short title]

**As a** [instructor | student],
**I want** [action],
**so that** [outcome].

**Acceptance Criteria:**
- [ ] AC-1: [Specific, testable condition. e.g., "POST /quiz/generate accepts `difficulty: easy | medium | hard`"]
- [ ] AC-2: [...]
- [ ] AC-3: [...]

---

### Story 2 — [Short title]

**As a** [instructor | student],
**I want** [action],
**so that** [outcome].

**Acceptance Criteria:**
- [ ] AC-1: [...]
- [ ] AC-2: [...]

> Add more stories as needed. Each actor path (instructor vs. student) should have its own story
> if the behavior differs.

---

## 3. Role & Access Rules

> `autoquiz-req-validator` explicitly checks role-based access. Be exact about who can do what.
> Map each rule to the relevant backend route and frontend page.

| Actor      | Allowed action                          | Denied action                          | Enforced at                                      |
|------------|-----------------------------------------|----------------------------------------|--------------------------------------------------|
| Instructor | [e.g., set difficulty when creating quiz] | [e.g., cannot change difficulty after publish] | `backend/app/api/routes/quiz.py` + `ClassView.jsx` |
| Student    | [e.g., select difficulty before generating] | [e.g., cannot change class-level defaults] | `backend/app/api/routes/quiz.py` + `Generate.jsx`  |
| Unauthenticated | None                             | All actions                            | Supabase RLS + FastAPI auth dependency           |

> If a route already has an auth dependency (e.g., `get_current_user`), note it here.
> If RLS changes are needed, call that out explicitly — the design-validator will check for them.

---

## 4. Design Decisions

> `autoquiz-design-validator` checks implementation against *intended* design.
> Document your decisions here so it has a reference — not just code to judge.

### 4a. Data persistence

- **Persisted to DB?** <!-- Yes / No -->
- **If yes:** table name, new columns, migration required (Yes/No)
- **If no:** reason (e.g., ephemeral per-request parameter, derived at query time)

### 4b. Backend architecture

- **Where does the logic live?**
  - New service method in `backend/app/services/`? <!-- Yes / No — which file -->
  - New route in `backend/app/api/routes/`? <!-- Yes / No — which file -->
  - Changes to existing Pydantic schemas in `schemas.py`? <!-- Yes / No -->
- **Async / sync?** <!-- Synchronous FastAPI route / Celery background task -->
- **LLM involvement?** <!-- Yes / No — if yes, which service method and what changes to the prompt -->

### 4c. Frontend architecture

- **Which pages are affected?**
  - `frontend/src/pages/instructor/` — <!-- ClassView.jsx / Dashboard.jsx / none -->
  - `frontend/src/pages/student/` — <!-- Generate.jsx / Dashboard.jsx / none -->
  - Other: <!-- list any shared components in frontend/src/components/ -->
- **State scope:** <!-- Local component state / AuthContext / new context -->
- **No secrets or API keys in client-side code** — confirm: <!-- Yes, confirmed -->

### 4d. RAG pipeline impact

- **Affects chunking?** <!-- Yes / No -->
- **Affects embedding?** <!-- Yes / No -->
- **Affects retrieval query?** <!-- Yes / No -->
- **Affects LLM prompt in `quiz_gen.py`?** <!-- Yes / No — describe change -->

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?**
  <!-- If yes: must use a pre-written dict/map instead of f-string interpolation.
       design-validator will flag raw string injection as MAJOR. -->
- **New SQL queries?** <!-- If yes: use parameterized queries only — no string concatenation -->
- **CORS / auth headers affected?** <!-- Yes / No -->

---

## 5. Out of Scope

> List what this feature explicitly does NOT do. Prevents prototyper scope creep and gives
> req-validator a clear boundary for PASS/FAIL verdicts.

- [e.g., "Difficulty is not stored per quiz attempt in this iteration"]
- [e.g., "Analytics dashboard for difficulty distribution is a separate feature"]
- [e.g., "No changes to the flashcard or notes pipeline"]

---

## 6. Open Questions

> Unresolved decisions that could block implementation. Resolve these before handing to the
> orchestrator, or the prototyper will surface them as open questions and stall.

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | [e.g., Should difficulty default differ between instructor-created and student-generated quizzes?] | [you] | [pending / resolved: answer here] |
| 2 | [...] | [...] | [...] |

---

## 7. Test Boundaries

> `autoquiz-tester` will write tests based on the ACs above. Use this section to flag anything
> that changes the testing approach.

- **External deps to mock:** <!-- e.g., openai.ChatCompletion, supabase_client.table() -->
- **Fixtures needed:** <!-- e.g., a quiz with difficulty="hard" already in DB -->
- **Integration vs. unit boundary:** <!-- e.g., route handler = integration test; prompt builder = unit test -->
- **Frontend test targets:** <!-- e.g., Generate.jsx renders selector; payload includes difficulty field -->
- **Explicitly out of test scope:** <!-- e.g., live OpenAI call, live Supabase writes -->
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

> Complete before invoking the orchestrator. The orchestrator will read this file via its `Read` tool.

- [ ] All user stories have at least 2 acceptance criteria
- [ ] Role/access table covers both instructor and student paths
- [ ] Design decisions are filled in (especially persistence and LLM impact)
- [ ] Out-of-scope list is non-empty
- [ ] Open questions are resolved or explicitly marked pending
- [ ] File saved as `specs/<feature-slug>.md`
