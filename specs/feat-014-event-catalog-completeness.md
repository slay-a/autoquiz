# Feature Brief: §14.3 Event Catalog Completeness

---

## 1. Summary

**Feature:** Close all §14.3 event-catalog emission gaps found in audit issue #38. Every event listed in the DESIGN.md §14.3 catalog must be emitted from the layer specified in §14.4; the one un-cataloged event (`quiz.load.completed`) must be resolved by either adding it to the catalog or removing the call.
**Requested by:** Internal (audit)
**Priority:** High (MAJOR severity per design-validator rules)

---

## 2. User Stories

### Story 1 — Upload route emits file-acceptance events

**As a** system operator,
**I want** `upload.file.accepted` and `upload.file.rejected` emitted from the upload route,
**so that** every file ingestion attempt is traceable in structured logs.

**Acceptance Criteria:**
- [ ] AC-1: `backend/app/api/routes/upload.py` calls `log_event("upload.file.accepted", ...)` with `meta={"mime_type": ..., "size_bytes": ...}` on every successful file acceptance.
- [ ] AC-2: `backend/app/api/routes/upload.py` calls `log_event("upload.file.rejected", ...)` with `level="WARNING"`, `outcome="failure"`, and `meta={"reason": "ext"|"size", "size_bytes": ...}` on every rejected upload.
- [ ] AC-3: Neither event includes PII (no file names, emails, or content per §14.5).

### Story 2 — Retrieval service emits search-completion event

**As a** system operator,
**I want** `retrieval.search.completed` emitted from the retrieval service,
**so that** search latency and result quality are observable.

**Acceptance Criteria:**
- [ ] AC-1: `backend/app/services/retrieval.py` calls `log_event("retrieval.search.completed", ...)` after every search with `meta={"top_k": ..., "chunks_returned": ..., "fallback_keyword": bool}` and `duration_ms` populated.
- [ ] AC-2: The event fires on both success and failure paths (outcome field set accordingly).

### Story 3 — Notes-gen service emits lifecycle events

**As a** system operator,
**I want** `notes.generate.started`, `notes.generate.completed`, and `notes.generate.failed` emitted from the notes generation service,
**so that** notes LLM call duration and failure modes are observable.

**Acceptance Criteria:**
- [ ] AC-1: `backend/app/services/notes_gen.py` calls `log_event("notes.generate.started", ...)` before invoking the LLM with `meta={"outside_sources": bool}`.
- [ ] AC-2: `backend/app/services/notes_gen.py` calls `log_event("notes.generate.completed", ...)` on success with `duration_ms` populated and `meta={"has_file": bool, "prompt_tokens": int}`.
- [ ] AC-3: `backend/app/services/notes_gen.py` calls `log_event("notes.generate.failed", level="ERROR", outcome="failure", ...)` on exception with `meta={"error_code": ..., "exception_type": ...}` and `duration_ms` populated.

### Story 4 — Notes route emits publish-toggle event

**As a** system operator,
**I want** `notes.publish.toggled` emitted from the notes route,
**so that** every publish-state change is auditable.

**Acceptance Criteria:**
- [ ] AC-1: `backend/app/api/routes/notes.py` calls `log_event("notes.publish.toggled", ...)` on every publish/unpublish action with `meta={"note_id": ..., "is_published": bool}`.
- [ ] AC-2: The event is emitted only after the DB write succeeds.

### Story 5 — Flashcards route emits set-lifecycle events

**As a** system operator,
**I want** `flashcard.set.created` and `flashcard.set.shared` emitted from the flashcards route,
**so that** flashcard creation and sharing are observable.

**Acceptance Criteria:**
- [ ] AC-1: `backend/app/api/routes/flashcards.py` calls `log_event("flashcard.set.created", ...)` on every successful set creation with `meta={"set_id": ..., "card_count": int, "set_type": ...}`.
- [ ] AC-2: `backend/app/api/routes/flashcards.py` calls `log_event("flashcard.set.shared", ...)` on every share action with `meta={"set_id": ..., "scope": "class"|"public"}`.

### Story 6 — Classes route emits member-removal event

**As a** system operator,
**I want** `class.member.removed` emitted from the classes route,
**so that** all class membership changes are fully auditable.

**Acceptance Criteria:**
- [ ] AC-1: `backend/app/api/routes/classes.py` calls `log_event("class.member.removed", ...)` on every successful member removal with `meta={"class_id": ..., "removed_by_instructor": bool}`.
- [ ] AC-2: The event fires only after the DB row is deleted (not before).

### Story 7 — Resolve un-cataloged `quiz.load.completed` event

**As a** system operator,
**I want** `quiz.load.completed` to either appear in the §14.3 catalog or be removed from the codebase,
**so that** no emitted event violates the design-validator MAJOR rule.

**Acceptance Criteria:**
- [ ] AC-1: Either `quiz.load.completed` is added to DESIGN.md §14.3 with `level`, `outcome`, `Fires from`, and `meta fields` columns filled, OR the `log_event("quiz.load.completed", ...)` call at `backend/app/api/routes/quiz.py:140` is removed.
- [ ] AC-2: After the fix, `grep -r "quiz.load.completed" backend/` either returns zero results or the event appears in DESIGN.md §14.3.

### Story 8 — Frontend emits auth-lifecycle and profile events

**As a** system operator,
**I want** `auth.session.started`, `auth.session.ended`, and `profile.updated` emitted from the frontend,
**so that** auth lifecycle events are observable even before the server-sink endpoint (GAP-8) is built.

**Acceptance Criteria:**
- [ ] AC-1: A `logEvent(event, fields)` shim exists in the frontend (e.g., `frontend/src/utils/logEvent.js`) that writes a §14.1-conformant envelope to `console.info` (per §14.4 — GAP-8 is not in scope).
- [ ] AC-2: `frontend/src/context/AuthContext.jsx` (or equivalent) calls `logEvent("auth.session.started", {...})` on successful sign-in and `logEvent("auth.session.ended", {...})` on sign-out.
- [ ] AC-3: The Profile page calls `logEvent("profile.updated", {fields_changed: [...]})` after a successful profile update.
- [ ] AC-4: No PII (email, display name, avatar URL) appears in any logged field per §14.5.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|---------------|---------------|-------------|
| Any authenticated user | Triggers events implicitly via normal feature use | Cannot suppress or spoof log events | Server-side `log_event()` only |
| System | All `log_event()` calls are internal | — | N/A |
| Unauthenticated | Auth events fire on sign-in/sign-out transitions | Cannot reach backend routes | Supabase RLS + FastAPI auth dependency |

No new RBAC rules are introduced — this feature only adds observability calls to existing authorized routes.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** No — events are structured log lines only (stdout JSON). No new tables or columns.

### 4b. Backend architecture

- **Where does the logic live?** Additions to existing files only — no new files:
  - `backend/app/api/routes/upload.py` — add `log_event` calls
  - `backend/app/services/retrieval.py` — add `log_event` calls
  - `backend/app/services/notes_gen.py` — add/fix `log_event` calls
  - `backend/app/api/routes/notes.py` — add `notes.publish.toggled` call
  - `backend/app/api/routes/flashcards.py` — add `log_event` calls
  - `backend/app/api/routes/classes.py` — add `log_event` call
  - `backend/app/api/routes/quiz.py` — resolve `quiz.load.completed`
- **Async / sync?** Synchronous — `log_event()` is a thin wrapper; no new async paths.
- **LLM involvement?** No.

### 4c. Frontend architecture

- **Which pages are affected?**
  - `frontend/src/context/AuthContext.jsx` (or equivalent auth context)
  - `frontend/src/pages/` — Profile page
  - New utility: `frontend/src/utils/logEvent.js`
- **State scope:** No state changes — pure side-effect calls.
- **No secrets or API keys in client-side code** — confirmed. The shim writes only to `console.info`.

### 4d. RAG pipeline impact

- **Affects chunking?** No
- **Affects embedding?** No
- **Affects retrieval query?** No — only adds a `log_event` call around the existing retrieval call.
- **Affects LLM prompt in `quiz_gen.py`?** No

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No.
- **New SQL queries?** No.
- **CORS / auth headers affected?** No.
- **PII risk:** All `meta` fields must be non-PII per §14.5. Specifically: `size_bytes` is safe; file names, user emails, question text, and note content must never appear in any logged field.

---

## 5. Out of Scope

- Adding a server-side HTTP sink for frontend events (that is GAP-8).
- Changing the `log_event()` helper itself (`backend/app/core/logging.py`).
- Adding new event domains beyond those already in §14.2.
- Any changes to quiz generation, flashcard study logic, or notes content.
- Retroactively back-filling historical logs.

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Should `quiz.load.completed` be added to §14.3 or removed? | Tech lead | Preferred: add to §14.3 (the event is useful for load-time observability). If added, `Fires from` = Route · quiz, `meta` = `{"quiz_id": str, "question_count": int}`. Prototyper should add to DESIGN.md §14.3 and keep the call. |

---

## 7. Test Boundaries

- **External deps to mock:** `app.core.logging.log_event` (assert it is called with correct event name and meta fields); `supabase_client.table()` for route tests.
- **Fixtures needed:** Existing auth fixtures; a dummy file upload payload; a retrieval result fixture; a notes record; a flashcard set; a class with members.
- **Integration vs. unit boundary:** Route handlers = integration tests (call the route, assert `log_event` mock was called with correct args). Service methods = unit tests (call service function directly, assert mock called).
- **Frontend test targets:** `logEvent` shim exports a function; `AuthContext` calls it on sign-in/sign-out; Profile page calls it after successful update.
- **Explicitly out of test scope:** Live Supabase writes, live OpenAI calls, actual `console.info` output verification.
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers relevant actors
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved
- [x] File saved as `specs/feat-014-event-catalog-completeness.md`
