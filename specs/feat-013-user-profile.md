# Feature Brief: User Profile (Avatar & Display Name)

---

## 1. Summary

**Feature:** Authenticated users (students and instructors) can open a profile page to pick a preset avatar and update their display name. The chosen avatar is shown in the top-right of the navbar across the app.
**Requested by:** Student / Instructor (both roles)
**Priority:** Medium

This feature is already implemented. This spec exists to onboard it into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 13.1 — View and edit profile

**As a** student or instructor,
**I want** to open a profile page that shows my current account details and lets me change my display name and avatar,
**so that** my identity in the app reflects how I want to be seen.

**Acceptance Criteria:**
- [ ] AC-13.1.1: The profile page (`/profile`) is reachable only by authenticated users. Both `student` and `instructor` roles are permitted (`<ProtectedRoute allowedRole={["student", "instructor"]}>`).
- [ ] AC-13.1.2: The page renders a preview block showing the currently selected avatar image, the current `full_name`, the user's `email`, and the user's `role` (capitalised).
- [ ] AC-13.1.3: The display-name input is pre-filled with the user's existing `full_name`. It is `required`, `minLength=1`, `maxLength=80`. The Save button is disabled while the trimmed value is empty.
- [ ] AC-13.1.4: The avatar picker renders a fixed list of preset DiceBear avatars (URLs of the form `https://api.dicebear.com/7.x/avataaars/svg?seed=<seed>`). Clicking a preset updates the preview block immediately without writing to Supabase. The currently selected preset has a visible selected state (ring/border).

---

### Story 13.2 — Save profile changes

**As a** student or instructor,
**I want** to save my chosen avatar and display name,
**so that** the changes persist across sessions and devices.

**Acceptance Criteria:**
- [ ] AC-13.2.1: Submitting the form calls `supabase.from("profiles").update({ full_name, avatar_url }).eq("id", user.id)`. No other rows in `profiles` may be updated by the request.
- [ ] AC-13.2.2: Both `full_name` (trimmed) and `avatar_url` are written in the same update. `email`, `role`, `created_at`, and `id` must not be modified by this feature.
- [ ] AC-13.2.3: While saving, the Save button shows a loading state and is disabled. On success, a confirmation message is shown and the page is reloaded so the cached `profile` in `AuthContext` is refreshed. On failure, the error message returned by Supabase is displayed inline; the form remains editable.
- [ ] AC-13.2.4: A user must not be able to update another user's profile row. Supabase RLS on `profiles` must enforce `auth.uid() = id` for `UPDATE`.

---

### Story 13.3 — Avatar surfaces in the navbar

**As a** student or instructor,
**I want** to see my avatar in the navbar and click it to reach the profile page,
**so that** my profile is one click away from anywhere in the app.

**Acceptance Criteria:**
- [ ] AC-13.3.1: The right side of the navbar renders the user's `avatar_url` as a small round image. When `avatar_url` is `null`/missing, a fallback `User` lucide icon inside a neutral circle is shown instead.
- [ ] AC-13.3.2: The avatar/name region is wrapped in a `<Link to="/profile">` and clicking it navigates to the profile page. The Logout button is unaffected and still works.
- [ ] AC-13.3.3: After a successful save, the navbar reflects the updated `avatar_url` and `full_name` (achieved by reloading the page in this implementation — see §4c).

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | View and update their own profile (`full_name`, `avatar_url`) | Update any other user's profile; modify `email`, `role`, `id`, `created_at` | `ProtectedRoute` (allowedRole `["student", "instructor"]`); Supabase RLS on `profiles` (`auth.uid() = id` on UPDATE) |
| Instructor | View and update their own profile (`full_name`, `avatar_url`) | Update any other user's profile; modify `email`, `role`, `id`, `created_at` | Same as student |
| Unauthenticated | None | All actions | `ProtectedRoute` wraps `/profile` |

> **RLS gap (verify):** `profiles` already has the per-user-update pattern from FEAT-001, but this feature adds a new updatable column (`avatar_url`). The validator must confirm the existing RLS policy on `profiles` allows UPDATE only when `auth.uid() = id`, and that no policy permits a user to UPDATE columns that should be immutable from the client (`role`, `email`, `id`). If only column-level GRANTs are present, document the gap.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Table:** `profiles` (existing)
  - Existing columns: `id` (uuid PK → auth.users), `email` (text), `full_name` (text), `role` (text check `instructor|student`), `created_at` (timestamptz)
  - **New column:** `avatar_url` (text, nullable). Stores the full URL of the selected DiceBear preset.
- **Migration required:** Yes — `alter table profiles add column if not exists avatar_url text;` Already added to `backend/supabase_schema.sql` so fresh deployments include it.
- **No new tables.** No new join tables. No write to `auth.users.raw_user_meta_data` — the feature only touches `public.profiles`.

### 4b. Backend architecture

- **No FastAPI routes added:** All profile reads and writes go through the Supabase JS client in the frontend, identical to the pattern used by FEAT-011 for `flashcard_sets` writes.
- **No Celery / Redis / LLM involvement.** No background jobs.
- **Async / sync?** The Supabase client `update` is async; UI shows a loading state until it resolves.

### 4c. Frontend architecture

- **New page:** `frontend/src/pages/Profile.jsx`
  - Local state: `fullName`, `avatar`, `saving`, `saved`, `error`
  - Imports `useAuth` for the current `user` and `profile`; reads `profile.full_name` and `profile.avatar_url` to seed initial state
  - Avatar presets: an in-file constant array of 8 seeds (`AVATAR_SEEDS`) and a helper `avatarUrl(seed)` that returns `https://api.dicebear.com/7.x/avataaars/svg?seed=<seed>`
  - On submit, calls `supabase.from("profiles").update({ full_name, avatar_url }).eq("id", user.id)` and on success calls `window.location.reload()` after ~600 ms so `AuthContext` re-reads the row from Supabase on next mount
- **Routing:** `frontend/src/App.jsx`
  - New import `import Profile from "./pages/Profile"`
  - New route `<Route path="/profile" element={<ProtectedRoute allowedRole={["student", "instructor"]}><Profile /></ProtectedRoute>} />`
- **Navbar:** `frontend/src/App.jsx`
  - Right-side region wrapped in `<Link to="/profile">` so clicking the user name/avatar navigates to the profile page
  - Renders `profile.avatar_url` as an `<img>` when present, otherwise a `<User>` lucide icon inside a `bg-gray-100` circle
- **Cache invalidation strategy:** The implementation uses a full-page reload (`window.location.reload()`) after save. This is intentional — the existing `AuthContext` caches `profile` in `localStorage` under `aq_profile`, and the simplest correct refresh is to let `AuthContext`'s mount-time fetch run again. A more refined approach would be exposing a `refreshProfile()` method on `AuthContext`; that is intentionally deferred (see Out of Scope §5).
- **No secrets in client-side code:** confirmed — DiceBear is unauthenticated.

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No.
- **Affects LLM prompt?** No.

### 4e. Security considerations

- **`profiles` RLS must scope UPDATE to `auth.uid() = id`:** any user being able to update another user's `full_name` or `avatar_url` would be a defacement vector. Validator must confirm the policy is in place.
- **Column immutability from client:** `email`, `role`, `id`, `created_at` must not be writable by the user from the client. Since `update({ full_name, avatar_url })` only sets those two fields, this is satisfied at the call site, but defence-in-depth column-level RLS or grants are recommended.
- **External-asset dependency:** avatar images are loaded from `api.dicebear.com`. This service is free, public, and stateless, but it is an external runtime dependency. If the service is unreachable, `<img>` tags will show broken-image icons but the saved `avatar_url` value remains valid. No PII is sent to DiceBear (only seed strings like `violet`, `mint`).
- **`avatar_url` validation:** the column is plain `text`. The current implementation only ever assigns one of 8 fixed DiceBear URLs from a constant, so the value is implicitly safe. If future iterations let users paste arbitrary URLs, validation (HTTPS only, allowlisted domains) would be required.
- **No new SQL queries, no CORS or auth header changes.**

---

## 5. Out of Scope

- Uploading custom avatar images (Supabase Storage upload + signed URLs) — DiceBear presets only
- Changing email, password, or role from the profile page
- Adding a `refreshProfile()` method to `AuthContext` to avoid the page reload after save (acceptable shortcut for this feature)
- Display-name uniqueness enforcement
- Profanity / moderation filtering of `full_name`
- An instructor-facing view of student profiles inside class views
- Caching DiceBear SVGs locally or migrating away from external avatar generation

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Should `avatar_url` accept arbitrary URLs in the schema (current) or be an enum/lookup of seed strings? | pipeline | Keep `text`. The 8 presets are enforced at the UI layer; broadening to user-uploaded avatars is a future feature where free-text URL is the right shape. |
| 2 | Is a full-page reload after save acceptable, or must `AuthContext` expose `refreshProfile()`? | pipeline | Acceptable for v1. Tracked under Out of Scope §5. |
| 3 | Should the picker enforce a default avatar at registration time (vs. leaving `avatar_url` null and showing the lucide fallback)? | pipeline | Leave null at registration. The fallback `<User>` icon is sufficient until the user opts in. The `handle_new_user` trigger in `supabase_schema.sql` is unchanged. |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.from('profiles')` (`.update(...).eq("id", user.id)`); `useAuth()` from `AuthContext` (return a fake `user` and `profile`); `window.location.reload` (replace with a spy to assert it was called)
- **Fixtures needed:**
  - A `profile` object with `full_name`, `email`, `role`, `avatar_url = null` (to exercise initial-empty state and the navbar fallback icon)
  - A `profile` object with a populated `avatar_url` (to exercise the navbar `<img>` branch and the avatar-picker initial-selected highlight)
  - A second `profile` belonging to a different user (to test RLS expectation: that an UPDATE keyed on a foreign `id` is rejected)
- **Integration vs. unit boundary:**
  - `Profile.jsx` — component tests: page renders preview with current name/email/role; Save disabled when name is empty or whitespace; clicking a preset highlights it and updates the preview image; submit calls `supabase.update` with `{ full_name, avatar_url }` and `.eq("id", user.id)` — and only those columns; success path shows confirmation and triggers `window.location.reload`; failure path renders the Supabase error and leaves the form editable
  - `App.jsx` Navbar — component tests: when `profile.avatar_url` is set, an `<img>` is rendered and the surrounding link points to `/profile`; when null, the `User` icon fallback renders; Logout button still triggers logout
  - Routing — `<Route path="/profile">` wrapped by `ProtectedRoute` with `allowedRole={["student","instructor"]}`; an unauthenticated user is redirected; both authenticated roles can render the page
- **Frontend test targets:**
  - `frontend/src/__tests__/Profile.test.jsx` — covers Story 13.1 and 13.2 ACs
  - Extend `frontend/src/__tests__/AuthContext.test.jsx` *or* add a lightweight Navbar test fixture covering Story 13.3 ACs (navbar avatar / link / fallback)
- **Backend test targets:**
  - None for application code (no FastAPI route added). Optional: a SQL-level test that confirms RLS rejects `update profiles set full_name='x' where id='<other-user>'` under the other user's JWT — note this requires a live Supabase test project and is acceptable to skip with an explicit skip-comment if the harness is not configured.
- **Explicitly out of test scope:** DiceBear network reachability, image rendering correctness, the visual flip/animation of the avatar picker, the `window.location.reload` execution itself (only that it was called)
- **Test quality standard:** Every test must assert a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, `assert 1 == 1`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why rather than writing a vacuous assertion.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-013-user-profile.md`
