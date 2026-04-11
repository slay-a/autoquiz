# Feature Brief: Authentication & Session Management

---

## 1. Summary

**Feature:** Authentication & Session Management — registration, login, session persistence, logout, and role-based route access.
**Requested by:** Internal
**Priority:** High

This feature is already implemented. This spec exists to onboard the feature into the pipeline so it can be validated against the design, verified against user stories, and covered by tests.

---

## 2. User Stories

### Story 1.1 — Registration

**As a** new user,
**I want** to create an account with my name, email, password, and role,
**so that** I can access the features appropriate to my role.

**Acceptance Criteria:**
- [x] AC-1.1.1: The registration form collects `full_name`, `email`, `password`, and `role` (`instructor` or `student`). Submission is blocked if any field is empty.
- [x] AC-1.1.2: On successful registration, a row is inserted into `profiles` with the submitted `full_name`, `email`, and `role`. The `id` matches the Supabase Auth user ID.
- [x] AC-1.1.3: After registration, the user is redirected to the role-appropriate dashboard: `/instructor` for instructors, `/student` for students.
- [x] AC-1.1.4: If the email is already registered, the form displays an error message and does not navigate away.

---

### Story 1.2 — Login

**As a** returning user,
**I want** to log in with my email and password,
**so that** I can resume my session.

**Acceptance Criteria:**
- [x] AC-1.2.1: The login form collects `email` and `password`. Submission is blocked if either field is empty.
- [x] AC-1.2.2: On successful login, the user is redirected to `/instructor` if `profile.role === 'instructor'`, or `/student` if `profile.role === 'student'`.
- [x] AC-1.2.3: If credentials are invalid, the form displays an error message and remains on `/login`.
- [x] AC-1.2.4: A logged-in user who navigates to `/login` is immediately redirected to their role-appropriate dashboard without seeing the login form.

---

### Story 1.3 — Session persistence

**As a** logged-in user,
**I want** my session to persist when I reload the page or close and reopen the browser,
**so that** I do not have to log in repeatedly.

**Acceptance Criteria:**
- [x] AC-1.3.1: On page reload, the app reads the Supabase session from `localStorage` (key prefixed `sb-*-auth-token`) without making a network request during the initial render.
- [x] AC-1.3.2: If the stored session has more than 60 seconds remaining, the user is treated as authenticated immediately — the loading spinner is not shown.
- [x] AC-1.3.3: If the stored session is expired or absent, the user is redirected to `/login`.
- [x] AC-1.3.4: The user's `profile` (including `role`) is cached in `localStorage` under the key `aq_profile` and restored synchronously on reload.

---

### Story 1.4 — Logout

**As a** logged-in user,
**I want** to log out,
**so that** my session is cleared and the next user of this device cannot access my account.

**Acceptance Criteria:**
- [x] AC-1.4.1: Clicking the logout button calls Supabase `signOut()`, clears the `aq_profile` key from `localStorage`, and redirects the user to `/login`.
- [x] AC-1.4.2: After logout, navigating to any protected route (`/instructor`, `/student`, etc.) redirects to `/login`.

---

### Story 1.5 — Role-based access control

**As** the system,
**I want** to prevent users from accessing routes intended for the other role,
**so that** students cannot reach instructor pages and vice versa.

**Acceptance Criteria:**
- [x] AC-1.5.1: Any route wrapped in `<ProtectedRoute allowedRole="instructor">` redirects a student to `/student`.
- [x] AC-1.5.2: Any route wrapped in `<ProtectedRoute allowedRole="student">` redirects an instructor to `/instructor`.
- [x] AC-1.5.3: Any route wrapped in `<ProtectedRoute>` (no role specified) redirects an unauthenticated user to `/login`.
- [x] AC-1.5.4: While `AuthContext` is loading, protected routes render a spinner and do not redirect prematurely.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Instructor | Access `/instructor/*` routes | Access `/student/*` routes | `ProtectedRoute.jsx` + `AuthContext.jsx` |
| Student | Access `/student/*` routes | Access `/instructor/*` routes | `ProtectedRoute.jsx` + `AuthContext.jsx` |
| Unauthenticated | Access `/login`, `/register` | All protected routes | `ProtectedRoute.jsx` |

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** Yes
- **Table:** `profiles` (Supabase Auth user + profile metadata)
- **Columns:** `id` (FK to auth.users), `full_name`, `email`, `role`, `created_at`
- **Migration required:** No (already in place)

### 4b. Backend architecture

- Authentication is handled entirely by Supabase Auth — there is no custom FastAPI auth route.
- The backend uses a `get_current_user` dependency (expected in routes that require auth) which validates the Supabase JWT from the `Authorization` header.
- No service-layer business logic for auth — the Supabase client handles token issuance and validation.

### 4c. Frontend architecture

- **Auth state lives in:** `frontend/src/contexts/AuthContext.jsx` — provides `user`, `profile`, `loading`, and `signOut` to the component tree.
- **Session restore:** `AuthContext` reads `aq_profile` from `localStorage` synchronously on mount and subscribes to `supabase.auth.onAuthStateChange`.
- **Route guarding:** `frontend/src/components/ProtectedRoute.jsx` — reads `AuthContext`; redirects based on `loading`, `user`, and `profile.role`.
- **Pages affected:** `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`
- **State scope:** `AuthContext` (global)
- **No secrets in client-side code:** confirmed — Supabase anon key and URL are environment variables.

### 4d. RAG pipeline impact

- **Affects chunking?** No
- **Affects embedding?** No
- **Affects retrieval query?** No
- **Affects LLM prompt?** No

### 4e. Security considerations

- **User-controlled data injected into LLM prompts?** No
- **New SQL queries?** No — Supabase Auth handles all user queries; `profiles` insert uses the Supabase client with the anon key and RLS.
- **CORS / auth headers affected?** No — existing CORS config and `Authorization: Bearer <token>` header pattern unchanged.

---

## 5. Out of Scope

- Password reset / forgot-password flow
- OAuth / social login providers
- Email verification on registration
- Multi-factor authentication
- Session revocation beyond local `signOut()`

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Does AC-1.3.2 (60-second threshold) match the actual AuthContext implementation? | pipeline | Req-validator should verify the localStorage restore path in AuthContext.jsx |

---

## 7. Test Boundaries

- **External deps to mock:** `supabase.auth.signUp`, `supabase.auth.signInWithPassword`, `supabase.auth.signOut`, `supabase.auth.onAuthStateChange`, `localStorage`
- **Fixtures needed:** mock profile object `{ id, full_name, email, role: 'instructor' }` and `{ role: 'student' }`
- **Integration vs. unit boundary:** `ProtectedRoute` and `AuthContext` = unit/component tests; login/register form submission = integration tests with mocked Supabase client
- **Frontend test targets:** `Login.jsx` form validation, `Register.jsx` form validation, `ProtectedRoute.jsx` redirect logic, `AuthContext.jsx` session restore from localStorage
- **Explicitly out of test scope:** live Supabase Auth calls, live database writes

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-001-auth-session.md`
