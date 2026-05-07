# Feature Brief: Flashcard Study

---

## 1. Summary

**Feature:** Students study a flashcard set card by card — flipping to reveal the answer, rating their confidence, seeing a results summary, and restarting with all cards or only the ones they missed. The editor lets them add, remove, and modify individual cards and save the changes.
**Requested by:** Student
**Priority:** High

This feature is already implemented. This spec exists to onboard it into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 11.1 — Study a flashcard set

**As a** student,
**I want** to flip through a set of flashcards and rate my confidence on each one,
**so that** I can identify which concepts I know and which need more practice.

**Acceptance Criteria:**
- [ ] AC-11.1.1: The flashcard study page (`/flashcards/:id`) loads the flashcard set from `flashcard_sets` by ID. If the ID does not exist or the set has no cards, the page displays an appropriate message rather than crashing.
- [ ] AC-11.1.2: Cards are displayed one at a time. The front face (`front` field) is shown by default; clicking the card flips it to reveal the back face (`back` field) and any optional `explanation`.
- [ ] AC-11.1.3: After the card is flipped, three rating buttons appear: Know (correct), Almost (partial), and Nope (incorrect). Selecting a rating records the result and advances to the next card. Rating buttons are not visible before the card is flipped.
- [ ] AC-11.1.4: After the last card is rated, a results summary is displayed showing the count for each of the three ratings.

---

### Story 11.2 — Restart a flashcard session

**As a** student,
**I want** to restart a flashcard session — either with all cards or only the ones I got wrong —
**so that** I can efficiently focus my remaining study time.

**Acceptance Criteria:**
- [ ] AC-11.2.1: The results summary provides two restart options: Restart All (resets to the full original card set in its original order) and Retry Missed (resets to only cards rated Nope).
- [ ] AC-11.2.2: Both restart options are always present on the results summary. If no cards were rated Nope, Retry Missed restarts with the full card set.
- [ ] AC-11.2.3: Restarting resets the card index to 0, clears all previously recorded ratings, hides the results summary, and returns to the front-face view of the first card.

---

### Story 11.3 — Edit a flashcard set

**As a** student,
**I want** to edit the cards in a flashcard set,
**so that** I can correct errors or add my own notes to the AI-generated content.

**Acceptance Criteria:**
- [ ] AC-11.3.1: The flashcard study page provides a link to `/flashcards/:id/edit`. The link is visible during the study session (not only on the results screen).
- [ ] AC-11.3.2: The flashcard editor (`FlashcardEditor`) displays each card's `front` and `back` fields as editable text inputs. An optional `explanation` field is also editable.
- [ ] AC-11.3.3: The editor allows adding new cards (both `front` and `back` must be non-empty to add) and deleting existing cards.
- [ ] AC-11.3.4: Saving updates the `cards` jsonb array and `title` in `flashcard_sets` for the set owned by the current user. After saving, the user is returned to `/flashcards/:id`.
- [ ] AC-11.3.5: Only the owner of a flashcard set (`created_by = current user`) can save changes or delete the set. An attempt to modify a set the user does not own must be blocked.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | Study, rate, restart, and edit their own flashcard sets; study sets where `is_public = true` | Edit or delete flashcard sets they do not own | `ProtectedRoute` (no role — any authenticated user); Supabase RLS on `flashcard_sets` should restrict writes to `created_by = auth.uid()` (currently `auth_all` — gap) |
| Instructor | None in this feature — flashcard study is student-facing | Access the study or editor pages | Route is not restricted by role; an instructor can reach `/flashcards/:id` if they know the ID — consider whether this is acceptable or should be blocked |
| Unauthenticated | None | All actions | `ProtectedRoute` wraps both `/flashcards/:id` and `/flashcards/:id/edit` |

> **RLS gap:** `flashcard_sets` uses the permissive `auth_all` policy. Any authenticated user can read, update, or delete any set by ID. The policy must be tightened: SELECT scoped to `created_by = auth.uid() OR is_public = true OR is_shared = true`; INSERT/UPDATE/DELETE scoped to `created_by = auth.uid()`.
>
> **Editor ownership gap:** `FlashcardEditor`'s `save()` and `deleteSet()` call `supabase.from("flashcard_sets").update(...).eq("id", id)` and `.delete().eq("id", id)` without verifying `created_by = current_user`. Once RLS is tightened, the database will reject cross-owner writes, but the editor should also surface an appropriate error to the user if this occurs.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Table:** `flashcard_sets` (existing)
  - `id` (uuid PK), `title` (text), `quiz_id` (uuid nullable FK → `saved_quizzes`), `created_by` (uuid FK → `profiles`, not null), `class_id` (uuid nullable FK → `classes`), `is_shared` (bool), `is_public` (bool), `share_code` (text nullable), `set_type` (text), `cards` (jsonb, default `[]`), `created_at`
- **Migration required:** No schema changes needed — RLS policy replacement is required (see §4e)
- **Session ratings are not persisted:** Know/Almost/Nope results exist only in local component state for the duration of the study session. There is no `study_sessions` or `card_ratings` table.

### 4b. Backend architecture

- **FastAPI routes exist at `/flashcards/*`** (migrated from direct Supabase access to satisfy DESIGN.md §0; issue #21):
  - `GET /flashcards/my` — Dashboard fetch (sets owned by current user)
  - `POST /flashcards/` — Create a new flashcard set
  - `DELETE /flashcards/by-type` — Delete sets by type (used by Generate.jsx deduplication)
  - `GET /flashcards/:id` — Load a set for study
  - `PUT /flashcards/:id` — Save edits (title + cards array)
  - `DELETE /flashcards/:id` — Delete a set
  - `PATCH /flashcards/:id/share` — Toggle share/public state
- **Ownership enforcement** is applied on all write routes (`created_by = current_user`).
- **No LLM involvement** in this feature — flashcard sets are pre-populated (generation is a separate concern). The study and edit flows are pure data retrieval and update.
- **Async / sync?** All FastAPI route handlers are async; no background tasks.

### 4c. Frontend architecture

- **Pages affected:**
  - `frontend/src/pages/FlashcardStudy.jsx` — card flip interaction, progress bar, rating buttons (show only after flip), results summary, Restart All / Retry Missed buttons, link to editor
  - `frontend/src/pages/FlashcardEditor.jsx` — card list with inline edit per card (front/back/explanation), add-card form, delete card, save set (updates title + cards), delete set, public/share toggle
  - `frontend/src/pages/student/Dashboard.jsx` — Flashcards tab listing the user's own sets with Study link
- **State scope:** All study session state (index, flipped, results, done) is local to `FlashcardStudy.jsx` — no persistence or context. Editor state (cards, title, editingIdx) is local to `FlashcardEditor.jsx`.
- **Card flip mechanism:** CSS 3D transform (`rotateY`) with `perspective` and `backfaceVisibility: hidden` — purely visual, no server interaction.
- **No secrets in client-side code:** confirmed

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No.
- **Affects LLM prompt?** No.

### 4e. Security considerations

- **`flashcard_sets` RLS is `auth_all` (MAJOR gap):** The current policy allows any authenticated user full read/write/delete access to all sets. Required replacement:
  - `SELECT`: `created_by = auth.uid() OR is_public = true OR is_shared = true`
  - `INSERT`: `with check (created_by = auth.uid())`
  - `UPDATE / DELETE`: `using (created_by = auth.uid())`
- **Editor writes unguarded:** `FlashcardEditor.save()` and `deleteSet()` do not verify ownership before calling Supabase. After RLS is tightened, cross-owner writes will be silently rejected by the DB. The editor should be updated to check `set.created_by === user.id` on load and render a read-only or error state if the current user is not the owner.
- **New SQL queries?** No raw SQL — all through the Supabase JS client.
- **CORS / auth headers?** No.

---

## 5. Out of Scope

- Persisting study session results (ratings not stored — ephemeral per session)
- Generating flashcard sets from quiz questions (covered in a separate feature)
- Sharing flashcard sets with a class or making them public (fields exist in schema but sharing UI is not part of this feature's stories — the editor's public/share toggle is bonus behaviour; do not remove)
- Scoring or spaced-repetition scheduling
- Drag-and-drop card reordering (GripVertical icon is rendered but reorder is not implemented)
- Progress tracking across multiple sessions

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Should the Retry Missed button always be shown in the results summary (falling back to full set when nope = 0), or is hiding it when nope = 0 acceptable? | pipeline | The spec (AC-11.2.2) requires it to always be present. The current implementation hides it when nope = 0. Prototyper must make the button always visible; when nope = 0, clicking it restarts with the full card set. |
| 2 | Should `/flashcards/:id` be restricted to `allowedRole="student"` or remain open to any authenticated user (including instructors)? | pipeline | Leave as `<ProtectedRoute>` with no role restriction — instructors may legitimately need to preview student-facing flashcards. Design-validator should note this as an accepted design decision. |
| 3 | Does the editor need to surface a UI error if `created_by` does not match the current user (post-RLS fix)? | pipeline | Yes — after tightening RLS, the editor should check ownership on load and show a clear "You don't have permission to edit this set" message rather than a silent save failure. |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('flashcard_sets')` (select by ID, update, delete)
- **Fixtures needed:**
  - A `flashcard_sets` row with 3 cards (MCQ-style front/back), owned by the test student
  - A `flashcard_sets` row owned by a different user (to test ownership enforcement)
  - A `flashcard_sets` row with `is_public = true` (to test read access for non-owners)
  - An empty or non-existent set ID (to test not-found state)
- **Integration vs. unit boundary:**
  - `FlashcardStudy.jsx` — component tests: card renders front by default; flip reveals back; rating buttons absent before flip, present after; rating advances to next card; results summary shown after last card with correct counts
  - `FlashcardEditor.jsx` — component tests: all card front/back fields editable; add card disabled when front or back empty; save calls Supabase update with updated cards array; cancel returns to study page without saving
  - Restart logic — unit tests on the restart function: Restart All restores original set order; Retry Missed filters to nope cards; Retry Missed falls back to full set when no nopes
- **Frontend test targets:**
  - `FlashcardStudy.jsx` — not-found message when set missing; flip toggle; rating buttons gated on flip; results summary counts; Restart All resets state; Retry Missed always present; Retry Missed with nope=0 restarts full set; Edit set link present during study
  - `FlashcardEditor.jsx` — editable front/back inputs; Add Card blocked on empty front or back; delete card removes from list; save navigates to `/flashcards/:id`
  - `Dashboard.jsx` — Flashcards tab shows sets fetched by `created_by = user.id`; Study link targets `/flashcards/:id`
- **Explicitly out of test scope:** CSS flip animation behaviour, live Supabase writes, RLS enforcement against a live DB, drag-and-drop reordering
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-011-flashcard-study.md`
