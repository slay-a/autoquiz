# AutoQuiz — Test Cases

> **Purpose:** Verifiable, automation-ready test cases derived 1:1 from the acceptance
> criteria in `UserStories.md`. Every AC maps to exactly one test case. Test cases are
> written so that each step can be executed by an automated test runner (Playwright for
> UI flows, pytest + httpx for API flows, direct Supabase SDK queries for DB assertions)
> without human judgment calls.
>
> **Convention:** Each test case follows the format:
> - **TC-ID:** Mirrors the AC it covers (e.g. TC-1.1.1 covers AC-1.1.1)
> - **Type:** `UI` (Vitest + React Testing Library, jsdom — Supabase / `fetch` mocked at the boundary), `API` (pytest + FastAPI `TestClient` — Supabase mocked), `UNIT` (pytest unit test against a service or helper), `DB` (Supabase live query — currently `MANUAL` until a live test instance is wired), or `MANUAL` (cannot be automated in the current harness; verified by hand pre-demo — used for visual contrast, RLS deployed-state checks, and cross-tab `storage` events)
> - **Setup:** Seed data or state that must exist before the test runs
> - **Steps:** Numbered, concrete actions with explicit selectors, endpoints, and payloads
> - **Assertions:** Exact, machine-verifiable conditions that must all pass
>
> **Selector convention:** `[data-testid="x"]` attributes are the canonical selectors. CSS class or element-type selectors are used only where test-id attributes are absent.
> **Network assertions:** in `UI` tests, network calls are asserted via mock invocation (`expect(fetch).toHaveBeenCalledWith(...)`); in `API` tests, via response status + body. **DB assertions:** in `API` tests, via `supabase_client.table().*` mock invocation. Live DB queries are reserved for `MANUAL` checks.
>
> **Note (2026-05-07):** The original convention referenced Playwright + live Supabase queries. The implemented harness is Vitest + RTL (frontend) and pytest + httpx (backend) with mocks at the network/DB boundary. TCs originally written for Playwright still describe the user-observable behaviour correctly; the assertion mechanism differs.

---

## Feature Group 1 — Authentication & Session Management

### Story 1.1 — Registration

---

**TC-1.1.1 — Registration form blocks submission on empty fields**
**Type:** UI

**Setup:** No seed data required.

**Steps:**
1. Navigate to `/register`.
2. Do not fill any field.
3. Query the submit button via `[data-testid="register-submit"]`.
4. Attempt `.click()` on the submit button.
5. Query each field's validation state via `[data-testid="field-error-full_name"]`, `[data-testid="field-error-email"]`, `[data-testid="field-error-password"]`, `[data-testid="field-error-role"]`.
6. Record any outgoing POST network requests to `/auth/v1/signup` during this step.

**Assertions:**
- `[data-testid="register-submit"]` has the `disabled` attribute set, OR no network request to `/auth/v1/signup` was initiated.
- The current URL remains `/register`.

---

**TC-1.1.2 — Successful registration creates a profile row with correct data**
**Type:** UI + DB

**Setup:** Generate a unique email (e.g. `test+{uuid}@example.com`) not present in `auth.users`. Choose `role = "instructor"`.

**Steps:**
1. Navigate to `/register`.
2. Fill `[data-testid="input-full_name"]` with `"Test Instructor"`.
3. Fill `[data-testid="input-email"]` with the generated email.
4. Fill `[data-testid="input-password"]` with `"Password123!"`.
5. Select `"instructor"` via `[data-testid="select-role"]`.
6. Click `[data-testid="register-submit"]`.
7. Wait for navigation to complete.
8. Query `profiles` table: `SELECT id, full_name, email, role FROM profiles WHERE email = '{generated_email}'`.
9. Query `auth.users`: `SELECT id FROM auth.users WHERE email = '{generated_email}'`.

**Assertions:**
- The `profiles` row exists with `full_name = "Test Instructor"`, `email = {generated_email}`, `role = "instructor"`.
- `profiles.id` equals `auth.users.id` for the same email.

---

**TC-1.1.3 — Successful registration redirects to role-appropriate dashboard**
**Type:** UI

**Setup:** Two unique emails not present in `auth.users` — one for instructor, one for student registration.

**Steps:**
1. Navigate to `/register`. Fill and submit the form with `role = "instructor"` using the first email.
2. Wait for navigation. Record the URL.
3. Log out (`DELETE /auth/v1/logout` or call Supabase `signOut()`). Clear `localStorage`.
4. Navigate to `/register`. Fill and submit the form with `role = "student"` using the second email.
5. Wait for navigation. Record the URL.

**Assertions:**
- After instructor registration: `window.location.pathname === "/instructor"`.
- After student registration: `window.location.pathname === "/student"`.

---

**TC-1.1.4 — Duplicate email registration shows error without navigation**
**Type:** UI

**Setup:** Seed one account with email `duplicate@example.com` via Supabase Admin API before the test.

**Steps:**
1. Navigate to `/register`.
2. Fill `[data-testid="input-email"]` with `"duplicate@example.com"`.
3. Fill remaining fields with any valid values.
4. Click `[data-testid="register-submit"]`.
5. Wait 2 seconds for any async response.
6. Query `[data-testid="form-error"]` for visible text content.

**Assertions:**
- `window.location.pathname === "/register"`.
- `[data-testid="form-error"]` is visible and has non-empty `textContent`.

---

### Story 1.2 — Login

---

**TC-1.2.1 — Login form blocks submission on empty fields**
**Type:** UI

**Setup:** No seed data required.

**Steps:**
1. Navigate to `/login`.
2. Do not fill any fields.
3. Click `[data-testid="login-submit"]`.
4. Record any outgoing POST network requests to `/auth/v1/token`.

**Assertions:**
- `[data-testid="login-submit"]` has the `disabled` attribute, OR no network request to `/auth/v1/token` was initiated.
- `window.location.pathname === "/login"`.

---

**TC-1.2.2 — Successful login redirects to role-appropriate dashboard**
**Type:** UI

**Setup:** Seed one instructor account (`instructor@example.com`, `Password123!`) and one student account (`student@example.com`, `Password123!`) via Supabase Admin API.

**Steps:**
1. Navigate to `/login`. Enter instructor credentials. Click `[data-testid="login-submit"]`. Wait for navigation. Record URL.
2. Clear session and localStorage. Navigate to `/login`. Enter student credentials. Click `[data-testid="login-submit"]`. Wait for navigation. Record URL.

**Assertions:**
- After instructor login: `window.location.pathname === "/instructor"`.
- After student login: `window.location.pathname === "/student"`.

---

**TC-1.2.3 — Invalid credentials show error without navigation**
**Type:** UI

**Setup:** No account exists for `nouser@example.com`.

**Steps:**
1. Navigate to `/login`.
2. Fill `[data-testid="input-email"]` with `"nouser@example.com"`.
3. Fill `[data-testid="input-password"]` with `"wrongpassword"`.
4. Click `[data-testid="login-submit"]`.
5. Wait 2 seconds.
6. Query `[data-testid="form-error"]`.

**Assertions:**
- `window.location.pathname === "/login"`.
- `[data-testid="form-error"]` is visible and has non-empty `textContent`.

---

**TC-1.2.4 — Already authenticated user navigating to /login is redirected away**
**Type:** UI

**Setup:** Seed one instructor account. Authenticate and store session in `localStorage` via Supabase `signInWithPassword` before the test (programmatic login, not UI).

**Steps:**
1. Navigate directly to `/login`.
2. Wait for any redirect to complete (up to 2 seconds).

**Assertions:**
- `window.location.pathname !== "/login"`.
- `window.location.pathname === "/instructor"` (for an instructor session).
- The login form (`[data-testid="login-form"]`) is not present in the DOM.

---

### Story 1.3 — Session persistence

---

**TC-1.3.1 — Valid session is restored from localStorage without a network auth request on reload**
**Type:** UI

**Setup:** Authenticate an instructor account programmatically. The session token is present in `localStorage` under a key matching `/^sb-.+-auth-token$/`.

**Steps:**
1. Start a network request monitor.
2. Reload the page via `page.reload()`.
3. Wait for the page to reach a stable state (no pending navigation).
4. Collect all network requests made during the reload whose URL matches `/auth/v1/token` or `/auth/v1/user`.

**Assertions:**
- `window.location.pathname === "/instructor"` (not `/login`).
- No network request to `/auth/v1/token` with method `POST` was made during the initial render phase (before `DOMContentLoaded`).

---

**TC-1.3.2 — Session with more than 60 seconds remaining shows no loading spinner on reload**
**Type:** UI

**Setup:** Authenticate an instructor. Verify the session's `expires_at` is more than 60 seconds in the future.

**Steps:**
1. Reload the page via `page.reload()`.
2. Immediately after reload begins, poll for `[data-testid="auth-loading-spinner"]` visibility for up to 500ms.

**Assertions:**
- `[data-testid="auth-loading-spinner"]` is never visible (not present in DOM or has `display: none`) during the 500ms window after reload.
- The dashboard content (`[data-testid="instructor-dashboard"]`) is present in the DOM within 2 seconds of reload.

---

**TC-1.3.3 — Expired or absent session redirects to /login**
**Type:** UI

**Setup:** Clear all `localStorage` entries. Ensure no valid Supabase session token exists.

**Steps:**
1. Navigate directly to `/instructor`.
2. Wait up to 3 seconds for any redirect.

**Assertions:**
- `window.location.pathname === "/login"`.

---

**TC-1.3.4 — Profile is cached in localStorage under aq_profile and restored on reload**
**Type:** UI

**Setup:** Authenticate an instructor account via UI login.

**Steps:**
1. After successful login, read `localStorage.getItem("aq_profile")`.
2. Parse the value as JSON. Record `role`.
3. Reload the page.
4. Before any network response resolves, read `localStorage.getItem("aq_profile")` again and parse it.

**Assertions:**
- After login: `localStorage.getItem("aq_profile")` is non-null and parses to a JSON object with `role === "instructor"`.
- After reload: the same key is readable and has the correct `role` before any `/auth/v1/user` network response completes.

---

### Story 1.4 — Logout

---

**TC-1.4.1 — Logout clears session, removes aq_profile, and redirects to /login**
**Type:** UI

**Setup:** Authenticate an instructor via UI login.

**Steps:**
1. Click `[data-testid="logout-button"]`.
2. Wait for navigation to complete.
3. Read `localStorage.getItem("aq_profile")`.
4. Read all `localStorage` keys matching `/^sb-.+-auth-token$/`.

**Assertions:**
- `window.location.pathname === "/login"`.
- `localStorage.getItem("aq_profile")` is `null`.
- No `localStorage` key matching `/^sb-.+-auth-token$/` has a non-null value.

---

**TC-1.4.2 — Post-logout navigation to protected routes redirects to /login**
**Type:** UI

**Setup:** Complete TC-1.4.1 (user is logged out, `localStorage` is cleared).

**Steps:**
1. Navigate directly to `/instructor`.
2. Wait up to 2 seconds. Record URL.
3. Navigate directly to `/student`.
4. Wait up to 2 seconds. Record URL.

**Assertions:**
- Both navigations result in `window.location.pathname === "/login"`.
- No protected page content (e.g. `[data-testid="instructor-dashboard"]` or `[data-testid="student-dashboard"]`) is present in the DOM.

---

### Story 1.5 — Role-based access control

---

**TC-1.5.1 — Student is redirected from instructor-only routes to /student**
**Type:** UI

**Setup:** Authenticate a student account.

**Steps:**
1. Navigate directly to `/instructor`.
2. Wait up to 2 seconds.

**Assertions:**
- `window.location.pathname === "/student"`.
- `[data-testid="instructor-dashboard"]` is not present in the DOM.

---

**TC-1.5.2 — Instructor is redirected from student-only routes to /instructor**
**Type:** UI

**Setup:** Authenticate an instructor account.

**Steps:**
1. Navigate directly to `/student`.
2. Wait up to 2 seconds.

**Assertions:**
- `window.location.pathname === "/instructor"`.
- `[data-testid="student-dashboard"]` is not present in the DOM.

---

**TC-1.5.3 — Unauthenticated user is redirected to /login from any protected route**
**Type:** UI

**Setup:** Clear all `localStorage` and cookies. No authenticated session exists.

**Steps:**
1. Navigate directly to `/instructor`. Wait up to 2 seconds. Record URL.
2. Navigate directly to `/student`. Wait up to 2 seconds. Record URL.
3. Navigate directly to `/quiz/some-id`. Wait up to 2 seconds. Record URL.

**Assertions:**
- All three navigations result in `window.location.pathname === "/login"`.

---

**TC-1.5.4 — Protected routes show spinner during auth loading; no premature redirect**
**Type:** UI

**Setup:** Authenticate an instructor. Intercept or delay the Supabase session resolution response by 1 second using a network proxy or `page.route()`.

**Steps:**
1. Navigate to `/instructor` while the auth resolution is artificially delayed.
2. Within 100ms of navigation, check for `[data-testid="auth-loading-spinner"]`.
3. After the delay resolves, check the URL and page content.

**Assertions:**
- `[data-testid="auth-loading-spinner"]` is visible within the first 100ms of navigation.
- After auth resolves, `window.location.pathname === "/instructor"` and the spinner is no longer visible.
- No redirect to `/login` occurred during the loading phase.

---

## Feature Group 2 — Class Management (Instructor)

### Story 2.1 — Create a class

---

**TC-2.1.1 — Submit button is disabled when name is empty or whitespace-only**
**Type:** UI

**Setup:** Authenticate an instructor.

**Steps:**
1. Navigate to `/instructor`.
2. Open the create class form via `[data-testid="open-create-class-form"]`.
3. Confirm `[data-testid="input-class-name"]` is empty. Check `[data-testid="create-class-submit"]` for `disabled` attribute.
4. Type `"   "` (three spaces) into `[data-testid="input-class-name"]`.
5. Check `[data-testid="create-class-submit"]` for `disabled` attribute again.
6. Record any outgoing POST requests to `/classes` during steps 3–5.

**Assertions:**
- `[data-testid="create-class-submit"]` has `disabled` attribute when field is empty.
- `[data-testid="create-class-submit"]` has `disabled` attribute when field contains only whitespace.
- No POST request to `/classes` (or equivalent backend endpoint) was made.

---

**TC-2.1.2 — Successful class creation inserts correct row with 6-char uppercase alphanumeric class code**
**Type:** UI + DB

**Setup:** Authenticate an instructor. Note the instructor's user ID.

**Steps:**
1. Open the create class form.
2. Fill `[data-testid="input-class-name"]` with `"Biology 101"`.
3. Fill `[data-testid="input-class-description"]` with `"Intro course"`.
4. Click `[data-testid="create-class-submit"]`.
5. Wait for the form to close or a success indicator to appear.
6. Query DB: `SELECT name, description, instructor_id, class_code FROM classes WHERE name = 'Biology 101' ORDER BY created_at DESC LIMIT 1`.

**Assertions:**
- The DB row exists with `name = "Biology 101"`, `description = "Intro course"`, `instructor_id = {current_user_id}`.
- `class_code` matches the regex `/^[A-Z0-9]{6}$/`.

---

**TC-2.1.3 — All class codes are unique across existing classes**
**Type:** DB

**Setup:** At least 10 classes exist in the `classes` table.

**Steps:**
1. Query: `SELECT class_code, COUNT(*) as cnt FROM classes GROUP BY class_code HAVING COUNT(*) > 1`.

**Assertions:**
- The query returns zero rows (no duplicate `class_code` values exist).

---

**TC-2.1.4 — New class appears at top of class list immediately after creation without page reload**
**Type:** UI

**Setup:** Authenticate an instructor who already has at least one class.

**Steps:**
1. Navigate to `/instructor`. Note the first class name in `[data-testid="class-list"]`.
2. Open the create class form. Fill `[data-testid="input-class-name"]` with `"New Top Class"`. Click submit.
3. Without reloading, query `[data-testid="class-list"] [data-testid="class-card"]:first-child [data-testid="class-name"]` for its `textContent`.

**Assertions:**
- The first `[data-testid="class-card"]` in the list has `textContent === "New Top Class"` without a page reload.

---

**TC-2.1.5 — Create class form resets to empty after successful submission**
**Type:** UI

**Setup:** Authenticate an instructor.

**Steps:**
1. Open the create class form.
2. Fill `[data-testid="input-class-name"]` with `"Temp Class"` and `[data-testid="input-class-description"]` with `"Temp desc"`.
3. Click `[data-testid="create-class-submit"]`.
4. Wait for the success state. If the form remains open, read the field values. If the form closes and reopens, open it again and read values.

**Assertions:**
- `[data-testid="input-class-name"]` has `value === ""`.
- `[data-testid="input-class-description"]` has `value === ""`.

---

### Story 2.2 — View class list

---

**TC-2.2.1 — Class list shows only the current instructor's classes**
**Type:** UI + DB

**Setup:** Seed Instructor A with 2 classes and Instructor B with 2 different classes via DB insert.

**Steps:**
1. Log in as Instructor A. Navigate to `/instructor`.
2. Collect all `[data-testid="class-card"] [data-testid="class-name"]` text values.
3. Query DB: `SELECT id FROM classes WHERE instructor_id = '{instructor_b_id}'`.

**Assertions:**
- The class names displayed on screen match exactly the classes belonging to Instructor A.
- No class name from Instructor B's classes appears in the rendered list.

---

**TC-2.2.2 — Each class card displays name, description, class code, and member count**
**Type:** UI + DB

**Setup:** Authenticate an instructor. Seed one class with known name, description, class code, and 3 enrolled students.

**Steps:**
1. Navigate to `/instructor`.
2. Locate the class card via `[data-testid="class-card"][data-class-id="{class_id}"]`.
3. Read `[data-testid="class-name"]`, `[data-testid="class-description"]`, `[data-testid="class-code"]`, and `[data-testid="class-member-count"]` text content within that card.

**Assertions:**
- `class-name` textContent equals the seeded class name.
- `class-description` textContent equals the seeded description.
- `class-code` textContent equals the seeded `class_code`.
- `class-member-count` textContent equals `"3"` (or contains `"3"`).

---

**TC-2.2.3 — Classes are displayed in descending order of created_at**
**Type:** UI + DB

**Setup:** Authenticate an instructor. Seed 3 classes with `created_at` values 1 hour apart (oldest first).

**Steps:**
1. Navigate to `/instructor`.
2. Collect `[data-testid="class-card"]` elements in DOM order. Read each card's `data-class-id` attribute.
3. Query DB: `SELECT id FROM classes WHERE instructor_id = '{user_id}' ORDER BY created_at DESC`.

**Assertions:**
- The `data-class-id` values from the DOM match the DB query result IDs in the same order (newest first).

---

**TC-2.2.4 — Clicking a class card navigates to /instructor/class/:id**
**Type:** UI

**Setup:** Authenticate an instructor with at least one class. Note the class ID.

**Steps:**
1. Navigate to `/instructor`.
2. Click `[data-testid="class-card"][data-class-id="{class_id}"]`.
3. Wait for navigation to complete.

**Assertions:**
- `window.location.pathname === "/instructor/class/{class_id}"`.

---

### Story 2.3 — View class detail

---

**TC-2.3.1 — Class detail page renders name, class code, and description**
**Type:** UI

**Setup:** Authenticate an instructor. Seed a class with `name = "Physics 201"`, `class_code = "ABC123"`, `description = "Advanced physics"`.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Read `[data-testid="class-name"]`, `[data-testid="class-code"]`, `[data-testid="class-description"]` text content.

**Assertions:**
- `class-name` textContent === `"Physics 201"`.
- `class-code` textContent === `"ABC123"`.
- `class-description` textContent === `"Advanced physics"`.

---

**TC-2.3.2 — Class detail page lists enrolled students' full names**
**Type:** UI + DB

**Setup:** Seed the class with 2 enrolled students: `"Alice Student"` and `"Bob Student"`.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Collect all `[data-testid="student-list-item"]` text content values.

**Assertions:**
- The list contains exactly 2 items.
- The items include `"Alice Student"` and `"Bob Student"` (exact match on `full_name`).

---

**TC-2.3.3 — Clicking the copy class code button writes the class code to the clipboard**
**Type:** UI

**Setup:** Authenticate an instructor on the class detail page. `class_code = "XYZ789"`.

**Steps:**
1. Grant clipboard permissions in the test browser context.
2. Click `[data-testid="copy-class-code-button"]`.
3. Read the clipboard value via `navigator.clipboard.readText()`.

**Assertions:**
- The clipboard value equals `"XYZ789"`.

---

**TC-2.3.4 — Class detail page contains upload, notes creation, and quiz sharing controls**
**Type:** UI

**Setup:** Authenticate an instructor on the class detail page.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Check for presence of `[data-testid="file-upload-control"]`, `[data-testid="create-notes-control"]`, `[data-testid="quiz-share-control"]`.

**Assertions:**
- All three elements are present in the DOM (not necessarily visible, but attached).

---

## Feature Group 3 — Class Membership (Student)

### Story 3.1 — Join a class

---

**TC-3.1.1 — Join button is disabled when class code input is empty**
**Type:** UI

**Setup:** Authenticate a student.

**Steps:**
1. Navigate to `/student`.
2. Confirm `[data-testid="input-class-code"]` is empty.
3. Check `[data-testid="join-class-button"]` for `disabled` attribute.
4. Record any outgoing network requests during this check.

**Assertions:**
- `[data-testid="join-class-button"]` has the `disabled` attribute.
- No network request was made.

---

**TC-3.1.2 — Valid class code inserts class_members row; lookup is case-insensitive**
**Type:** UI + DB

**Setup:** Seed a class with `class_code = "ABC123"`. Authenticate a student not yet enrolled. Note `student_id` and `class_id`.

**Steps:**
1. Navigate to `/student`.
2. Type `"abc123"` (lowercase) into `[data-testid="input-class-code"]`.
3. Click `[data-testid="join-class-button"]`.
4. Wait for success indicator.
5. Query DB: `SELECT * FROM class_members WHERE class_id = '{class_id}' AND student_id = '{student_id}'`.

**Assertions:**
- Exactly one row exists in `class_members` with the correct `class_id` and `student_id`.

---

**TC-3.1.3 — Invalid class code shows error element; no redirect**
**Type:** UI

**Setup:** Authenticate a student. No class with code `"ZZZZZZ"` exists.

**Steps:**
1. Navigate to `/student`.
2. Type `"ZZZZZZ"` into `[data-testid="input-class-code"]`.
3. Click `[data-testid="join-class-button"]`.
4. Wait 2 seconds.

**Assertions:**
- `[data-testid="join-class-error"]` is visible and has non-empty `textContent`.
- `window.location.pathname === "/student"`.

---

**TC-3.1.4 — Re-joining an already-joined class does not insert a duplicate row**
**Type:** UI + DB

**Setup:** Student is already a member of a class with `class_code = "DEF456"`. Note `class_id` and `student_id`.

**Steps:**
1. Navigate to `/student`.
2. Type `"DEF456"` into `[data-testid="input-class-code"]`.
3. Click `[data-testid="join-class-button"]`.
4. Wait 2 seconds.
5. Query DB: `SELECT COUNT(*) FROM class_members WHERE class_id = '{class_id}' AND student_id = '{student_id}'`.

**Assertions:**
- The COUNT is exactly `1` (no duplicate row inserted).
- A message is visible in the UI (e.g. `[data-testid="join-class-message"]` has non-empty `textContent`).

---

**TC-3.1.5 — Newly joined class appears in student class list without page reload**
**Type:** UI

**Setup:** Authenticate a student. Seed a class with a unique code not yet joined by the student.

**Steps:**
1. Navigate to `/student`. Count existing `[data-testid="class-card"]` elements. Record count as `N`.
2. Join the class using its code.
3. Without reloading, count `[data-testid="class-card"]` elements again.

**Assertions:**
- The new count equals `N + 1`.
- A `[data-testid="class-card"]` with `data-class-id` matching the newly joined class is present in the DOM.

---

### Story 3.2 — View class content as a student

---

**TC-3.2.1 — Student dashboard shows only shared quizzes; unshared quizzes are absent**
**Type:** UI + DB

**Setup:** Seed one quiz with `is_shared = true` and one with `is_shared = false`, both in a class the student has joined. Note both quiz IDs.

**Steps:**
1. Log in as the student. Navigate to `/student`.
2. Collect all `[data-testid="quiz-card"]` elements and their `data-quiz-id` attributes.

**Assertions:**
- The quiz with `is_shared = true` has its ID in the collected set.
- The quiz with `is_shared = false` does NOT have its ID in the collected set.

---

**TC-3.2.2 — Student dashboard shows only published notes; unpublished notes are absent**
**Type:** UI + DB

**Setup:** Seed one note with `is_published = true` and one with `is_published = false` in the student's class. Note both note IDs.

**Steps:**
1. Log in as the student. Navigate to `/student`.
2. Collect all `[data-testid="note-card"]` elements and their `data-note-id` attributes.

**Assertions:**
- The note with `is_published = true` has its ID in the collected set.
- The note with `is_published = false` does NOT have its ID in the collected set.

---

**TC-3.2.3 — Each shared quiz and published note displays the class name as a label**
**Type:** UI

**Setup:** Student is in two classes: `"Biology 101"` and `"Physics 201"`. Each class has one shared quiz and one published note.

**Steps:**
1. Navigate to `/student`.
2. For each `[data-testid="quiz-card"]`, read `[data-testid="quiz-class-label"]` text content.
3. For each `[data-testid="note-card"]`, read `[data-testid="note-class-label"]` text content.

**Assertions:**
- Quiz cards for the Biology class have `quiz-class-label` textContent === `"Biology 101"`.
- Quiz cards for the Physics class have `quiz-class-label` textContent === `"Physics 201"`.
- The same label assertions hold for note cards.

---

**TC-3.2.4 — Clicking a shared quiz navigates to /quiz/:id; clicking a note navigates to /class-note/:id**
**Type:** UI

**Setup:** A shared quiz with `id = quiz_id` and a published note with `id = note_id` are visible on the student dashboard.

**Steps:**
1. Click `[data-testid="quiz-card"][data-quiz-id="{quiz_id}"]`.
2. Record URL. Navigate back.
3. Click `[data-testid="note-card"][data-note-id="{note_id}"]`.
4. Record URL.

**Assertions:**
- After clicking quiz: `window.location.pathname === "/quiz/{quiz_id}"`.
- After clicking note: `window.location.pathname === "/class-note/{note_id}"`.

---

## Feature Group 4 — LlamaIndex Ingestion Pipeline

### Story 4.1 — LlamaIndex-based document parsing

---

**TC-4.1.1 — parsers.py uses LlamaIndex readers; all three file types process without error**
**Type:** UNIT

**Setup:** Provide a valid test PDF (1 page), DOCX (1 page), and PPTX (1 slide) in the test fixtures directory.

**Steps:**
1. Call the parser function for the PDF fixture. Capture the return value and any raised exceptions.
2. Repeat for the DOCX fixture.
3. Repeat for the PPTX fixture.
4. Inspect `parsers.py` source for imports of `PDFReader`, `DocxReader`, `PptxReader` from `llama_index.readers.file`.

**Assertions:**
- All three calls return a non-empty list without raising any exception.
- `"PDFReader"`, `"DocxReader"`, and `"PptxReader"` are present as imports in `parsers.py` source.
- No import of `fitz`, `docx`, or `pptx` (python-pptx) is present in `parsers.py`.

---

**TC-4.1.2 — Parsed Document objects contain page_label in metadata**
**Type:** UNIT

**Setup:** A multi-page PDF fixture (at least 3 pages) in the test fixtures directory.

**Steps:**
1. Call the PDF parser with the multi-page fixture.
2. For each `Document` object in the returned list, access `.metadata.get("page_label")`.

**Assertions:**
- Every `Document` object has a non-`None` `page_label` value in `.metadata`.
- The `page_label` values are strings or integers representing page numbers.

---

**TC-4.1.3 — Unsupported file type raises ValueError with extract| prefix**
**Type:** UNIT

**Setup:** A `.txt` file available in test fixtures.

**Steps:**
1. Call the parser function with the `.txt` fixture path.
2. Capture any raised exception.

**Assertions:**
- A `ValueError` is raised.
- The exception message starts with `"extract|"`.

---

**TC-4.1.4 — Old parse functions and direct library imports are absent from parsers.py**
**Type:** UNIT

**Setup:** Read the source of `backend/app/utils/parsers.py`.

**Steps:**
1. Check for the string `"parse_pdf"` in the source.
2. Check for `"parse_docx"`.
3. Check for `"parse_pptx"`.
4. Check for `"import fitz"` or `"from fitz"`.
5. Check for `"import docx"` or `"from docx"` (python-docx direct import).
6. Check for `"import pptx"` or `"from pptx"` (python-pptx direct import).

**Assertions:**
- All six checks return `False` (none of these strings appear in the source file).

---

### Story 4.2 — LlamaIndex SentenceSplitter for chunking

---

**TC-4.2.1 — SentenceSplitter is instantiated with values from settings**
**Type:** UNIT

**Setup:** Set `CHUNK_SIZE_TOKENS = 400` and `CHUNK_OVERLAP_TOKENS = 60` in the test `.env`.

**Steps:**
1. Import and instantiate the ingestion module under test.
2. Mock `SentenceSplitter.__init__` to capture the arguments it receives.
3. Trigger the chunking path with a sample document.

**Assertions:**
- `SentenceSplitter` was called with `chunk_size=400` and `chunk_overlap=60`.

---

**TC-4.2.2 — get_nodes_from_documents is the method used for chunking**
**Type:** UNIT

**Setup:** A sample LlamaIndex `Document` object available as a fixture.

**Steps:**
1. Mock `SentenceSplitter.get_nodes_from_documents` and record calls.
2. Call the ingestion chunking path with the sample document.

**Assertions:**
- `SentenceSplitter.get_nodes_from_documents` was called exactly once with the sample document list.
- No custom word-count or character-count splitting function was called.

---

**TC-4.2.3 — clean_text, detect_sections, and chunk_sections are absent from ingestion.py**
**Type:** UNIT

**Setup:** Read the source of `backend/app/services/ingestion.py`.

**Steps:**
1. Check for the string `"clean_text"` in the source.
2. Check for `"detect_sections"`.
3. Check for `"chunk_sections"`.

**Assertions:**
- All three checks return `False`.

---

**TC-4.2.4 — Every chunk row in the DB has non-empty text after ingestion**
**Type:** DB

**Setup:** A document has been fully ingested with `status = "success"`. Note its `file_id`.

**Steps:**
1. Query: `SELECT COUNT(*) FROM chunks WHERE file_id = '{file_id}' AND (text IS NULL OR TRIM(text) = '')`.

**Assertions:**
- The COUNT equals `0`. No chunk rows with null or whitespace-only `text` exist for the file.

---

### Story 4.3 — TextNode → chunks table mapping

---

**TC-4.3.1 — chunks rows have exactly the required columns populated**
**Type:** DB

**Setup:** A file has been fully ingested. Note its `file_id`.

**Steps:**
1. Query: `SELECT chunk_id, file_id, section_id, section_title, page_numbers, text FROM chunks WHERE file_id = '{file_id}' LIMIT 10`.
2. For each row, verify each of the six columns is present (not missing from the result set).

**Assertions:**
- All rows have all six columns present in the result set.
- `chunk_id`, `file_id`, `text` are non-null for every row.
- `page_numbers` is a non-null array for every row.

---

**TC-4.3.2 — Every chunk has a unique UUID v4 chunk_id**
**Type:** DB

**Setup:** A file has been ingested producing at least 5 chunks.

**Steps:**
1. Query: `SELECT chunk_id FROM chunks WHERE file_id = '{file_id}'`.
2. Validate each `chunk_id` against the UUID v4 regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`.
3. Check for duplicates: `SELECT chunk_id, COUNT(*) FROM chunks WHERE file_id = '{file_id}' GROUP BY chunk_id HAVING COUNT(*) > 1`.

**Assertions:**
- Every `chunk_id` matches the UUID v4 regex.
- The duplicates query returns zero rows.

---

**TC-4.3.3 — page_numbers reflects node metadata; defaults to [1] when absent**
**Type:** DB + UNIT

**Setup:** Ingest a multi-page document where page metadata is known. Also ingest a document that produces nodes without `page_label`.

**Steps:**
1. For the multi-page document: query `SELECT page_numbers FROM chunks WHERE file_id = '{file_id_paged}'`. Verify values match expected page numbers.
2. For the no-label document: query `SELECT page_numbers FROM chunks WHERE file_id = '{file_id_nolabel}'`.

**Assertions:**
- Multi-page document chunks have `page_numbers` arrays containing the correct page numbers.
- No-label document chunks have `page_numbers = ARRAY[1]` (PostgreSQL array literal).

---

**TC-4.3.4 — section_title reflects node metadata; is null when absent**
**Type:** DB + UNIT

**Setup:** Ingest a document where some nodes have `section_title` in metadata and some do not.

**Steps:**
1. Query: `SELECT section_title FROM chunks WHERE file_id = '{file_id}' AND section_title IS NOT NULL LIMIT 5`.
2. Query: `SELECT COUNT(*) FROM chunks WHERE file_id = '{file_id}' AND section_title IS NULL`.

**Assertions:**
- At least one row has a non-null `section_title` (from nodes with the metadata key).
- The COUNT of null `section_title` rows is greater than 0 (confirming the default null path).

---

**TC-4.3.5 — VectorStoreIndex, StorageContext, SupabaseVectorStore are absent from all backend source files**
**Type:** UNIT

**Setup:** Access to all Python source files under `backend/`.

**Steps:**
1. Recursively search all `.py` files under `backend/` for the strings `"VectorStoreIndex"`, `"StorageContext"`, and `"SupabaseVectorStore"`.

**Assertions:**
- None of the three strings appear in any `.py` file under `backend/`.

---

## Feature Group 5 — File Upload & Processing Pipeline

### Story 5.1 — Upload a document

---

**TC-5.1.1 — Unsupported file extensions are rejected client-side before any network request**
**Type:** UI

**Setup:** Authenticate a user. Prepare a `.txt` file for upload.

**Steps:**
1. Navigate to the page containing `[data-testid="file-upload-input"]`.
2. Start a network request monitor.
3. Attach the `.txt` file to `[data-testid="file-upload-input"]` via `setInputFiles()`.
4. Check for `[data-testid="upload-error"]`.
5. Collect any POST requests sent during steps 3–4.

**Assertions:**
- `[data-testid="upload-error"]` is visible with non-empty `textContent`.
- No POST request to `/upload/` was made.

---

**TC-5.1.2 — File larger than 50MB returns HTTP 413 and UI shows error message**
**Type:** API + UI

**Setup:** Generate or obtain a supported-extension file (e.g. `.pdf`) whose size exceeds 50MB.

**Steps:**
1. Send `POST /upload/` with `multipart/form-data` containing the oversized file.
2. Record the HTTP status code of the response.
3. Via UI: attach the file to `[data-testid="file-upload-input"]` and submit. Check `[data-testid="upload-error"]`.

**Assertions:**
- API response status code is `413`.
- `[data-testid="upload-error"]` is visible in the UI with non-empty `textContent`.

---

**TC-5.1.3 — Uploaded file is stored in Supabase Storage at {file_id}/{filename}**
**Type:** API + DB

**Setup:** Authenticate a user. Prepare a valid 1KB `.pdf` file named `test-upload.pdf`.

**Steps:**
1. Send `POST /upload/` with the file. Parse the response JSON to extract `file_id`.
2. Query Supabase Storage API: `GET /storage/v1/object/uploads/{file_id}/test-upload.pdf`.

**Assertions:**
- The storage API returns HTTP 200 (the object exists at the expected path).

---

**TC-5.1.4 — uploaded_files row is created with correct file_id, filename, and uploaded_by**
**Type:** API + DB

**Setup:** Authenticate as a user with known `user_id`. Prepare a valid `.pdf` file.

**Steps:**
1. Send `POST /upload/` with the file. Parse `file_id` from response.
2. Query DB: `SELECT file_id, filename, uploaded_by FROM uploaded_files WHERE file_id = '{file_id}'`.

**Assertions:**
- Exactly one row is returned.
- `filename === "test-upload.pdf"`.
- `uploaded_by === {user_id}`.

---

**TC-5.1.5 — processing_jobs row is created with status=queued, stage=upload; job_id is in response**
**Type:** API + DB

**Setup:** Authenticate a user. Prepare a valid `.pdf` file.

**Steps:**
1. Send `POST /upload/` with the file. Parse response JSON for `job_id` and `status`.
2. Query DB: `SELECT job_id, status, stage FROM processing_jobs WHERE job_id = '{job_id}'`.

**Assertions:**
- Response JSON contains `job_id` (non-empty string) and `status === "queued"`.
- DB row exists with `status = "queued"` and `stage = "upload"`.

---

### Story 5.2 — Track processing status

---

**TC-5.2.1 — GET /upload/status/{job_id} returns HTTP 200 with correct fields**
**Type:** API

**Setup:** A `job_id` from a previous upload exists in `processing_jobs`.

**Steps:**
1. Send `GET /upload/status/{job_id}`.
2. Parse the response JSON.

**Assertions:**
- Response status code is `200`.
- Response body contains: `job_id` (string), `file_id` (string), `status` (string), `stage` (string or null), `error_code` (string or null), `error_message` (string or null), `created_at` (ISO8601 string), `updated_at` (ISO8601 string).
- All field types match the above specification.

---

**TC-5.2.2 — Job status only ever takes values in the allowed status enum**
**Type:** DB

**Setup:** Multiple completed jobs exist in `processing_jobs`.

**Steps:**
1. Query: `SELECT DISTINCT status FROM processing_jobs WHERE job_id IN ({list_of_known_job_ids})`.

**Assertions:**
- Every distinct `status` value is one of: `"queued"`, `"in_progress"`, `"success"`, `"failed"`.
- No other values appear.

---

**TC-5.2.3 — Stage field only takes values in the allowed stage enum**
**Type:** DB

**Setup:** Multiple jobs with various stage values exist.

**Steps:**
1. Query: `SELECT DISTINCT stage FROM processing_jobs WHERE stage IS NOT NULL`.

**Assertions:**
- Every distinct `stage` value is one of: `"upload"`, `"extract"`, `"clean"`, `"section"`, `"chunk"`.
- No other non-null values appear.

---

**TC-5.2.4 — Failed job has status=failed with non-empty error_message and error_code**
**Type:** API + DB

**Setup:** A job exists with `status = "failed"` (seed directly into DB or use a known-corrupt file). Note its `job_id`.

**Steps:**
1. Send `GET /upload/status/{job_id}`.
2. Parse `status`, `error_message`, `error_code` from the response.
3. Query DB: `SELECT status, error_message, error_code FROM processing_jobs WHERE job_id = '{job_id}'`.

**Assertions:**
- `status === "failed"` in both the API response and DB.
- `error_message` is a non-empty, non-null string in both the API response and DB.
- `error_code` is a non-empty, non-null string in both the API response and DB.

---

**TC-5.2.5 — updated_at is incremented on each status change by the DB trigger**
**Type:** DB

**Setup:** A job is in `status = "queued"`. Record its `updated_at` timestamp as `T1`.

**Steps:**
1. Update the job's status to `"in_progress"` (via the Celery worker or a direct DB update to simulate the trigger).
2. Query: `SELECT updated_at FROM processing_jobs WHERE job_id = '{job_id}'`. Record as `T2`.
3. Update status to `"success"`.
4. Query `updated_at` again. Record as `T3`.

**Assertions:**
- `T2 > T1`.
- `T3 > T2`.
- The change in `updated_at` is driven by the `jobs_updated_at` trigger, not by application code setting the field manually (verify by confirming no `SET updated_at = NOW()` in application source).

---

### Story 5.3 — Re-access previously uploaded files (Instructor)

---

**TC-5.3.1 — Class detail file list shows only files with status=success**
**Type:** UI + DB

**Setup:** Seed 2 files for a class: one with `status = "success"`, one with `status = "failed"`. Note both `file_id`s.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Collect all `[data-testid="file-list-item"]` elements and their `data-file-id` attributes.

**Assertions:**
- The file with `status = "success"` has its `file_id` in the collected set.
- The file with `status = "failed"` does NOT have its `file_id` in the collected set.

---

**TC-5.3.2 — Each file list entry shows filename and created_at**
**Type:** UI

**Setup:** One file with `filename = "lecture1.pdf"` and a known `created_at` timestamp is in the class file list.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Find `[data-testid="file-list-item"][data-file-id="{file_id}"]`.
3. Read `[data-testid="file-name"]` and `[data-testid="file-created-at"]` text content.

**Assertions:**
- `file-name` textContent === `"lecture1.pdf"`.
- `file-created-at` textContent is a non-empty string representing a date/time (parseable as a date).

---

**TC-5.3.3 — Selecting an existing file sets file_id in generation request without re-uploading**
**Type:** UI + API

**Setup:** A file with `status = "success"` is in the class file list. Note its `file_id`.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Click `[data-testid="file-list-item"][data-file-id="{file_id}"]`.
3. Start a network request monitor.
4. Trigger quiz generation.
5. Capture the POST request to `/quiz/generate`.

**Assertions:**
- The request payload contains `"file_id": "{file_id}"`.
- No POST request to `/upload/` was made during steps 2–4.

---

**TC-5.3.4 — File list is scoped to the current class only**
**Type:** UI + DB

**Setup:** Instructor has Class A with File A and Class B with File B. Both files have `status = "success"`.

**Steps:**
1. Navigate to `/instructor/class/{class_a_id}`.
2. Collect all `data-file-id` attributes from `[data-testid="file-list-item"]`.

**Assertions:**
- File A's `file_id` is in the collected set.
- File B's `file_id` is NOT in the collected set.

---

### Story 5.4 — Re-access previously uploaded files (Student)

---

**TC-5.4.1 — Student generate page shows only the student's own files with status=success**
**Type:** UI + DB

**Setup:** Student A has 2 files: one `status = "success"`, one `status = "in_progress"`. Student B has a separate `status = "success"` file. Note all `file_id`s.

**Steps:**
1. Log in as Student A. Navigate to `/student` (or the generate page).
2. Collect all `data-file-id` attributes from `[data-testid="file-list-item"]`.

**Assertions:**
- Student A's `status = "success"` file is in the collected set.
- Student A's `status = "in_progress"` file is NOT in the set.
- Student B's file is NOT in the set.

---

**TC-5.4.2 — Each student file entry shows filename and created_at**
**Type:** UI

**Setup:** Student has a file with `filename = "mynotes.docx"` and a known `created_at`.

**Steps:**
1. Navigate to the generate page.
2. Find `[data-testid="file-list-item"][data-file-id="{file_id}"]`.
3. Read `[data-testid="file-name"]` and `[data-testid="file-created-at"]` text content.

**Assertions:**
- `file-name` textContent === `"mynotes.docx"`.
- `file-created-at` is a non-empty, parseable date string.

---

**TC-5.4.3 — Selecting an existing file uses its file_id in generation request without re-uploading**
**Type:** UI + API

**Setup:** Student has a file with `status = "success"`. Note its `file_id`.

**Steps:**
1. Navigate to the generate page.
2. Click the file in `[data-testid="file-list-item"][data-file-id="{file_id}"]`.
3. Start network monitor.
4. Trigger quiz generation.
5. Capture the POST to `/quiz/generate`.

**Assertions:**
- The request payload contains `"file_id": "{file_id}"`.
- No POST to `/upload/` was made.

---

**TC-5.4.4 — Student file list shows only files uploaded by the current student**
**Type:** UI

**Setup:** Two students each have a unique file with `status = "success"`. Note both `file_id`s.

**Steps:**
1. Log in as Student A. Collect all `data-file-id` from `[data-testid="file-list-item"]`.
2. Log out. Log in as Student B. Collect all `data-file-id` from `[data-testid="file-list-item"]`.

**Assertions:**
- Student A's file is in Step 1's set; Student B's file is NOT in Step 1's set.
- Student B's file is in Step 2's set; Student A's file is NOT in Step 2's set.

---

**TC-5.4.5 — File picker and upload input are mutually exclusive**
**Type:** UI

**Setup:** Student has at least one file in the picker. Both `[data-testid="file-list-item"]` and `[data-testid="file-upload-input"]` are rendered.

**Steps:**
1. Click a `[data-testid="file-list-item"]` to select it.
2. Check whether `[data-testid="file-upload-input"]` is disabled or has `aria-disabled="true"` or is hidden.
3. Click `[data-testid="clear-file-selection"]` (or equivalent) to deselect.
4. Interact with `[data-testid="file-upload-input"]` (set a file).
5. Check whether `[data-testid="file-list-item"]` elements are disabled or the section is hidden.

**Assertions:**
- After step 1: `[data-testid="file-upload-input"]` is disabled, hidden, or `aria-disabled="true"`.
- After step 4: `[data-testid="file-list-item"]` elements are disabled, hidden, or the picker section is not interactable.

---

## Feature Group 6 — Quiz Generation

### Story 6.1 — Generate a quiz from uploaded material

---

**TC-6.1.1 — Empty or whitespace-only topic returns HTTP 400**
**Type:** API

**Setup:** None.

**Steps:**
1. Send `POST /quiz/generate` with body `{"topic": "", "num_questions": 5}`.
2. Record response status.
3. Send `POST /quiz/generate` with body `{"topic": "   ", "num_questions": 5}`.
4. Record response status.

**Assertions:**
- Both requests return HTTP status `400`.
- Neither response body contains a `questions` array.

---

**TC-6.1.2 — Quiz generation with file_id retrieves exactly top 12 chunks via hybrid search**
**Type:** UNIT + API

**Setup:** Mock the retrieval service. A file with `file_id = "test-file"` is available.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "cell biology", "file_id": "test-file", "num_questions": 5}`.
2. Capture the arguments passed to the retrieval function (via mock or log inspection).

**Assertions:**
- The retrieval function was called with `top_k = 12` and `file_id = "test-file"`.
- The retrieval used both vector search and keyword search (both execution paths were triggered).

---

**TC-6.1.3 — No relevant content with outside_sources=false returns HTTP 404**
**Type:** API

**Setup:** Mock retrieval to return an empty list for `file_id = "empty-file"`.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "anything", "file_id": "empty-file", "outside_sources": false}`.
2. Record response status and body.

**Assertions:**
- Response status code is `404`.
- Response body contains a non-empty `detail` string.

---

**TC-6.1.4 — Every question in the response contains all required fields; MCQ includes options**
**Type:** API

**Setup:** Mock GPT-4o to return a valid structured response with one MCQ, one true/false, and one short answer question.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "test", "question_types": ["mcq", "true_false", "short_answer"], "num_questions": 3}`.
2. Parse the `questions` array from the response.
3. For each question, check keys: `question_id`, `type`, `question`, `answer`, `explanation`, `source_chunk_ids`, `page_numbers`.
4. For the MCQ question, check for the `options` key.

**Assertions:**
- All 7 required keys are present on every question object.
- The MCQ question has an `options` key whose value is a list of objects each with `label` and `text`.
- True/false and short answer questions do NOT have an `options` key, or it is `null`/empty.

---

**TC-6.1.5 — Response question count matches num_questions parameter**
**Type:** API

**Setup:** Mock GPT-4o to return exactly the requested number of questions.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "test", "num_questions": 3}`. Count `questions` in response.
2. Send with `{"topic": "test", "num_questions": 7}`. Count `questions` in response.
3. Send with `{"topic": "test"}` (no `num_questions`). Count `questions` in response.

**Assertions:**
- Request with `num_questions: 3` returns exactly 3 questions.
- Request with `num_questions: 7` returns exactly 7 questions.
- Request without `num_questions` returns exactly 5 questions (default).

---

### Story 6.2 — Select difficulty level

---

**TC-6.2.1 — Invalid difficulty values return HTTP 422**
**Type:** API

**Setup:** None.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "test", "difficulty": "extreme"}`. Record status.
2. Send with `{"topic": "test", "difficulty": "Easy"}`. Record status.
3. Send with `{"topic": "test", "difficulty": 1}`. Record status.

**Assertions:**
- All three requests return HTTP status `422`.

---

**TC-6.2.2 — Omitting difficulty defaults to medium in the response**
**Type:** API

**Setup:** None.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "test"}` (no `difficulty` field).
2. Parse `difficulty` from the response body.

**Assertions:**
- Response body `difficulty === "medium"`.

---

**TC-6.2.3 — Chosen difficulty appears in the LLM prompt**
**Type:** UNIT

**Setup:** Mock the OpenAI client to capture the messages array sent to GPT-4o.

**Steps:**
1. Call the quiz generation service with `difficulty = "hard"`.
2. Capture the `messages` array passed to the OpenAI mock.
3. Concatenate all message content strings. Search for the word `"hard"` or its pre-written expansion.

**Assertions:**
- The concatenated prompt string contains `"hard"` or a pre-written phrase corresponding to hard difficulty.

---

**TC-6.2.4 — difficulty value is present in the QuizResponse body**
**Type:** API

**Setup:** None.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "test", "difficulty": "easy"}`.
2. Parse `difficulty` from the response body.

**Assertions:**
- `response.difficulty === "easy"`.

---

### Story 6.3 — Generate a quiz using general knowledge

---

**TC-6.3.1 — outside_sources=true with no file_id calls LLM without retrieving any chunks**
**Type:** UNIT

**Setup:** Mock both the retrieval service and the OpenAI client.

**Steps:**
1. Call quiz generation service with `{"topic": "volcanoes", "outside_sources": true}` and no `file_id`.
2. Check whether the retrieval mock was called.
3. Check whether the OpenAI mock was called.

**Assertions:**
- The retrieval mock was NOT called (call count is 0).
- The OpenAI mock was called exactly once.

---

**TC-6.3.2 — outside_sources=true with file_id: outside-source questions have [Outside Source] in explanation**
**Type:** API

**Setup:** Mock retrieval to return a small number of chunks. Mock GPT-4o to return questions where some are explicitly flagged as outside-source.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "test", "file_id": "test-file", "outside_sources": true}`.
2. For each question in the response, check `explanation` for the prefix `"[Outside Source]"`.

**Assertions:**
- At least one question's `explanation` starts with `"[Outside Source]"`.
- Questions grounded in retrieved chunks do NOT have `"[Outside Source]"` in their `explanation`.

---

**TC-6.3.3 — No file_id and outside_sources=false returns HTTP 200, not 404**
**Type:** API

**Setup:** None.

**Steps:**
1. Send `POST /quiz/generate` with `{"topic": "gravity", "outside_sources": false}` and no `file_id`.
2. Record response status.

**Assertions:**
- Response status code is `200`.
- Response body contains a `questions` array with at least one item.

---

## Feature Group 7 — Quiz Study & Saving

### Story 7.1 — Study a quiz

---

**TC-7.1.1 — Valid quiz ID renders content; invalid ID shows not-found message without crashing**
**Type:** UI

**Setup:** Seed a quiz with known `quiz_id` containing at least one question.

**Steps:**
1. Navigate to `/quiz/{quiz_id}`. Check for `[data-testid="quiz-content"]`.
2. Navigate to `/quiz/00000000-0000-0000-0000-000000000000`. Check for `[data-testid="quiz-not-found"]`. Verify no JS error is thrown (listen for `page.on("pageerror")`).

**Assertions:**
- Valid ID: `[data-testid="quiz-content"]` is present and visible; no `[data-testid="quiz-not-found"]` visible.
- Invalid ID: `[data-testid="quiz-not-found"]` is present and visible; no uncaught JS error was thrown.

---

**TC-7.1.2 — MCQ questions render all options with A/B/C/D labels; only one selectable at a time**
**Type:** UI

**Setup:** Seed a quiz with one MCQ question having 4 options.

**Steps:**
1. Navigate to `/quiz/{quiz_id}`.
2. Count all `[data-testid="mcq-option"]` elements.
3. Read `[data-testid="mcq-option-label"]` text content for each option.
4. Click option A. Then click option B.
5. Check which option is in the selected state (e.g. has `aria-checked="true"` or `data-selected="true"`).

**Assertions:**
- Exactly 4 `[data-testid="mcq-option"]` elements are present.
- Labels are exactly `"A"`, `"B"`, `"C"`, `"D"`.
- After clicking B, only option B is in the selected state; option A is not selected.

---

**TC-7.1.3 — Submitting an answer reveals correct answer and explanation; options become non-interactive**
**Type:** UI

**Setup:** A quiz with one MCQ question is open.

**Steps:**
1. Click an answer option.
2. Click `[data-testid="submit-answer-button"]`.
3. Check for `[data-testid="correct-answer"]` and `[data-testid="explanation"]`.
4. Attempt to click a different answer option.
5. Check whether the option's state changed.

**Assertions:**
- `[data-testid="correct-answer"]` is visible after submission.
- `[data-testid="explanation"]` is visible and has non-empty `textContent`.
- Attempting to click a different option after submission does not change the selected state (option remains non-interactive: `disabled` or `aria-disabled="true"`).

---

**TC-7.1.4 — True/false questions render exactly two options labelled True and False**
**Type:** UI

**Setup:** A quiz with one true/false question is seeded.

**Steps:**
1. Navigate to the quiz page.
2. Count `[data-testid="tf-option"]` elements.
3. Read the text content of each.

**Assertions:**
- Exactly 2 `[data-testid="tf-option"]` elements are present.
- One has textContent `"True"` and the other has textContent `"False"`.

---

**TC-7.1.5 — Short answer question renders an input field; model answer is revealed on submission**
**Type:** UI

**Setup:** A quiz with one short answer question is seeded.

**Steps:**
1. Navigate to the quiz page.
2. Check for `[data-testid="short-answer-input"]`.
3. Type `"some answer"` into the input.
4. Click `[data-testid="submit-answer-button"]`.
5. Check for `[data-testid="model-answer"]`.

**Assertions:**
- `[data-testid="short-answer-input"]` is present before submission.
- `[data-testid="model-answer"]` is visible and has non-empty `textContent` after submission.

---

### Story 7.2 — Save a generated quiz

---

**TC-7.2.1 — Save button inserts a saved_quizzes row with correct values**
**Type:** UI + DB

**Setup:** Generate a quiz in the UI (or mock the generation). The authenticated user's `user_id` is known.

**Steps:**
1. After quiz generation, click `[data-testid="save-quiz-button"]`.
2. Wait for save confirmation.
3. Query DB: `SELECT id, title, topic, difficulty, file_id, created_by, is_shared, questions FROM saved_quizzes WHERE created_by = '{user_id}' ORDER BY created_at DESC LIMIT 1`.

**Assertions:**
- Row exists with `created_by === user_id`.
- `is_shared === false`.
- `questions` is a non-empty JSON array.
- `topic` and `difficulty` match the generated quiz's values.

---

**TC-7.2.2 — Auto-generated title follows {topic} — {difficulty} format**
**Type:** DB

**Setup:** A quiz was generated with `topic = "Photosynthesis"` and `difficulty = "easy"` and saved.

**Steps:**
1. Query DB: `SELECT title FROM saved_quizzes WHERE created_by = '{user_id}' ORDER BY created_at DESC LIMIT 1`.

**Assertions:**
- `title === "Photosynthesis — easy"`.

---

**TC-7.2.3 — Save button is replaced by confirmation indicator and is not clickable after save**
**Type:** UI

**Setup:** A quiz has been generated and is visible.

**Steps:**
1. Verify `[data-testid="save-quiz-button"]` is present and not disabled.
2. Click it. Wait for save to complete.
3. Check for `[data-testid="save-quiz-button"]` presence.
4. Check for `[data-testid="save-quiz-confirmation"]` presence.

**Assertions:**
- After save: `[data-testid="save-quiz-button"]` is either absent from the DOM or has `disabled` attribute.
- `[data-testid="save-quiz-confirmation"]` is visible.

---

**TC-7.2.4 — Saved quiz appears on student dashboard under quizzes tab**
**Type:** UI + DB

**Setup:** A student has saved a quiz with known `quiz_id`.

**Steps:**
1. Navigate to `/student`.
2. Click `[data-testid="quizzes-tab"]`.
3. Collect all `data-quiz-id` attributes from `[data-testid="quiz-card"]`.

**Assertions:**
- The `quiz_id` is present in the collected set.

---

### Story 7.3 — Regenerate a quiz

---

**TC-7.3.1 — Regenerate button sends POST /quiz/generate with original quiz parameters**
**Type:** UI + API

**Setup:** A saved quiz with known `topic = "Genetics"`, `num_questions = 5`, `difficulty = "medium"`, `file_id = "f1"`, `question_types = ["mcq"]`, `outside_sources = false` is open at `/quiz/{quiz_id}`.

**Steps:**
1. Start network request monitor.
2. Click `[data-testid="regenerate-quiz-button"]`.
3. Capture the POST request to `/quiz/generate`.
4. Parse the request payload.

**Assertions:**
- Payload contains `topic === "Genetics"`.
- Payload contains `num_questions === 5`.
- Payload contains `difficulty === "medium"`.
- Payload contains `file_id === "f1"`.
- Payload contains `question_types` equal to `["mcq"]`.
- Payload contains `outside_sources === false`.

---

**TC-7.3.2 — Regenerated quiz is saved with title suffixed (v2)**
**Type:** DB

**Setup:** Original quiz has `title = "Genetics — medium"`. Regeneration has been triggered and completed.

**Steps:**
1. Query DB: `SELECT title FROM saved_quizzes WHERE created_by = '{user_id}' ORDER BY created_at DESC LIMIT 1`.

**Assertions:**
- `title === "Genetics — medium (v2)"`.

---

**TC-7.3.3 — Page navigates to the new quiz URL after regeneration**
**Type:** UI

**Setup:** A quiz is open and regeneration has been triggered.

**Steps:**
1. Click `[data-testid="regenerate-quiz-button"]`.
2. Wait for navigation to complete.
3. Capture `window.location.pathname`.
4. Parse the new quiz ID from the URL.

**Assertions:**
- `window.location.pathname` matches `/quiz/{new_id}` where `new_id` is different from the original quiz ID.
- Query DB confirms the new `quiz_id` exists in `saved_quizzes`.

---

### Story 7.4 — See score and self-assess after submission

---

**TC-7.4.1 — Score banner shows correct/total_graded over MCQ+TF only with score-band copy**
**Type:** UI

**Setup:** A quiz with 4 MCQ, 1 TF, and 2 short-answer questions is loaded at `/quiz/{quiz_id}`. The student answers all questions. Of the 5 auto-graded (MCQ + TF), the student gets 4 correct.

**Steps:**
1. Click `[data-testid="submit-quiz-button"]`.
2. Wait for `[data-testid="score-banner"]` to render.
3. Read its `textContent`.
4. Repeat the run with 5/5, 0/5, and 3/5 correct to cover all four score bands.

**Assertions:**
- The banner displays `4/5` (auto-graded denominator excludes the 2 short-answer questions).
- Banner copy contains `"Great job!"` for 4/5 (≥80%).
- Banner copy contains `"Perfect!"` for 5/5 (100%).
- Banner copy contains `"Keep studying!"` for 3/5 (≥50%).
- Banner copy contains `"Review and try again"` for 0/5 (<50%).

---

**TC-7.4.2 — Trophy badge in header shows the same ratio and toggles banner visibility**
**Type:** UI

**Setup:** Quiz with 5 auto-graded questions and 4 correct has been submitted. `[data-testid="score-banner"]` is visible.

**Steps:**
1. Locate `[data-testid="score-trophy-badge"]` in the page header.
2. Read its `textContent`.
3. Click the badge.
4. Check visibility of `[data-testid="score-banner"]`.
5. Click the badge again.
6. Check visibility of `[data-testid="score-banner"]`.

**Assertions:**
- The badge `textContent` matches the banner ratio (e.g. `4/5`).
- After step 3: `[data-testid="score-banner"]` is hidden.
- After step 5: `[data-testid="score-banner"]` is visible again.

---

**TC-7.4.3 — Banner footer notes short-answer self-review when SA questions are present**
**Type:** UI

**Setup (Part A):** Quiz contains at least one short-answer question. Quiz is submitted.
**Setup (Part B):** Quiz contains only MCQ + TF (no short-answer). Quiz is submitted.

**Steps:**
1. Read the `textContent` of `[data-testid="score-banner-footer"]` (or the banner element if footer is inline).

**Assertions (Part A):**
- The footer text mentions self-review of short-answer questions and that they are not counted in the score.

**Assertions (Part B):**
- The self-review footer text is absent.

---

**TC-7.4.4 — Each short-answer card exposes self-assess "I got this right / wrong" toggle after submission**
**Type:** UI

**Setup:** Quiz contains at least one short-answer question. Quiz is submitted.

**Steps:**
1. Locate every `[data-testid="question-card"][data-question-type="short_answer"]`.
2. Within each, locate `[data-testid="self-assess-correct-button"]` and `[data-testid="self-assess-incorrect-button"]`.
3. Click `[data-testid="self-assess-incorrect-button"]` on the first short-answer card.
4. Inspect the wrong-pool by reading the convert-to-flashcards CTA badge count (see TC-7.5.1).

**Assertions:**
- Both self-assess buttons are present on every short-answer card after submission.
- The buttons are absent before submission.
- Clicking incorrect adds the card to the wrong-pool (CTA count increments by 1).

---

**TC-7.4.5 — All scoring is computed client-side; no submit/grade endpoint is called**
**Type:** UI

**Setup:** Quiz is loaded at `/quiz/{quiz_id}`. Student answers all questions.

**Steps:**
1. Start network request monitor (mock `fetch`).
2. Click `[data-testid="submit-quiz-button"]`.
3. Wait for `[data-testid="score-banner"]` to render.
4. Filter recorded network requests for any matching `/quiz/{quiz_id}/submit` or `/quiz/{quiz_id}/grade`.

**Assertions:**
- Zero requests were made to any `/quiz/.../submit` or `/quiz/.../grade` endpoint.
- The score banner rendered without a server round-trip.

---

### Story 7.5 — Convert wrong answers to flashcards

---

**TC-7.5.1 — Convert CTA appears in banner and header when wrong-pool is non-empty**
**Type:** UI

**Setup:** Quiz with 4 MCQ, 1 TF, 2 short-answer is loaded. Student gets 1 MCQ wrong. After submission, the student self-marks 1 short-answer as wrong.

**Steps:**
1. Submit the quiz.
2. Self-mark one short-answer as incorrect via `[data-testid="self-assess-incorrect-button"]`.
3. Locate `[data-testid="convert-to-flashcards-cta"]` in the score banner.
4. Locate `[data-testid="convert-to-flashcards-badge"]` in the page header.

**Assertions:**
- Both elements are present.
- `textContent` of the CTA references `"2 wrong answers"` (1 MCQ + 1 self-marked SA).

---

**TC-7.5.2 — Clicking CTA creates flashcard_sets row linked to source quiz with one card per wrong question**
**Type:** UI + DB

**Setup:** Quiz with `quiz_id = 'q1'` is submitted. Wrong-pool contains 2 questions: one MCQ (`question = "Q1"`, `answer = "A"`, `explanation = "E1"`) and one self-marked SA (`question = "Q2"`, `answer = "A2"`, `explanation = "E2"`).

**Steps:**
1. Click `[data-testid="convert-to-flashcards-cta"]`.
2. Wait for the `flashcard_sets` insert mock to be invoked (or query DB directly).
3. Inspect the inserted row.

**Assertions:**
- `flashcard_sets` insert is called once with `quiz_id === "q1"`.
- The inserted row's `cards` array has length 2.
- `cards[0]` has `front === "Q1"`, `back === "A"`, `explanation === "E1"`.
- `cards[1]` has `front === "Q2"`, `back === "A2"`, `explanation === "E2"`.

---

**TC-7.5.3 — After creation, page navigates to /flashcards/:new_id**
**Type:** UI

**Setup:** Conversion CTA is visible. Backend mock returns a created flashcard set with `id = 'new-set-1'`.

**Steps:**
1. Click `[data-testid="convert-to-flashcards-cta"]`.
2. Wait for navigation.
3. Read `window.location.pathname`.

**Assertions:**
- `window.location.pathname === "/flashcards/new-set-1"`.

---

**TC-7.5.4 — CTA is hidden when there are no wrong questions**
**Type:** UI

**Setup:** Quiz with all auto-graded answers correct and no short-answer self-marked wrong.

**Steps:**
1. Submit the quiz.
2. Verify no short-answer is self-marked wrong (or that the quiz contains no SA questions).
3. Query DOM for `[data-testid="convert-to-flashcards-cta"]` and `[data-testid="convert-to-flashcards-badge"]`.

**Assertions:**
- Both elements are absent from the DOM.

---

## Feature Group 8 — Quiz Sharing (Instructor)

### Story 8.1 — Share a quiz with a class

---

**TC-8.1.1 — Class detail page lists quizzes for the class, each with a share toggle**
**Type:** UI

**Setup:** Authenticate an instructor. Seed a quiz associated with a class.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Collect all `[data-testid="quiz-share-row"]` elements.
3. For each row, check for presence of `[data-testid="quiz-share-toggle"]`.

**Assertions:**
- At least one `[data-testid="quiz-share-row"]` is present.
- Every `[data-testid="quiz-share-row"]` contains a `[data-testid="quiz-share-toggle"]`.

---

**TC-8.1.2 — Toggling share on sets is_shared=true; toggling off sets is_shared=false**
**Type:** UI + DB

**Setup:** A quiz with `is_shared = false` is in the class. Note its `quiz_id`.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Click `[data-testid="quiz-share-toggle"][data-quiz-id="{quiz_id}"]` to toggle on.
3. Query DB: `SELECT is_shared FROM saved_quizzes WHERE id = '{quiz_id}'`. Record value.
4. Click the toggle again to toggle off.
5. Query DB again. Record value.

**Assertions:**
- After step 2: `is_shared === true`.
- After step 4: `is_shared === false`.

---

**TC-8.1.3 — Quiz with is_shared=false is absent from student quiz list**
**Type:** UI + DB

**Setup:** A quiz has `is_shared = false`. At least one student is enrolled in the class.

**Steps:**
1. Log in as the enrolled student. Navigate to `/student`.
2. Collect all `data-quiz-id` attributes from `[data-testid="quiz-card"]`.

**Assertions:**
- The unshared quiz's ID is NOT present in the collected set.

---

**TC-8.1.4 — Share toggle reflects current is_shared state on page load**
**Type:** UI + DB

**Setup:** Quiz A has `is_shared = true`. Quiz B has `is_shared = false`. Both belong to the same class.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Read `aria-checked` (or `data-checked`) attribute of `[data-testid="quiz-share-toggle"][data-quiz-id="{quiz_a_id}"]`.
3. Read the same attribute for `[data-testid="quiz-share-toggle"][data-quiz-id="{quiz_b_id}"]`.

**Assertions:**
- Quiz A's toggle has `aria-checked === "true"` (or equivalent `data-checked="true"`).
- Quiz B's toggle has `aria-checked === "false"` (or equivalent `data-checked="false"`).

---

### Story 8.3 — Delete a shared quiz

---

**TC-8.3.1 — Delete button removes the row from saved_quizzes**
**Type:** UI + DB

**Setup:** An instructor is on `/instructor/class/{class_id}`. A quiz with known `quiz_id` is listed.

**Steps:**
1. Locate `[data-testid="quiz-delete-button"][data-quiz-id="{quiz_id}"]`.
2. Click it. Confirm any prompt that appears.
3. Wait for the `saved_quizzes` DELETE mock to be invoked (or query DB directly): `SELECT id FROM saved_quizzes WHERE id = '{quiz_id}'`.

**Assertions:**
- The DELETE on `saved_quizzes` was called with the matching `id`.
- A subsequent SELECT returns zero rows for that `id`.

---

**TC-8.3.2 — After deletion, quiz is removed from class quiz list without page reload**
**Type:** UI

**Setup:** Instructor is on `/instructor/class/{class_id}`. Count `[data-testid="quiz-share-row"]` elements as `N`.

**Steps:**
1. Click `[data-testid="quiz-delete-button"][data-quiz-id="{quiz_id}"]` for one of the listed quizzes.
2. Wait for the row to disappear (no full reload).
3. Count `[data-testid="quiz-share-row"]` elements again.

**Assertions:**
- The new count equals `N - 1`.
- The deleted quiz's `data-quiz-id` is no longer present in the DOM.
- `window.location.pathname` is unchanged.

---

## Feature Group 9 — Notes Generation (Student)

### Story 9.1 — Generate study notes from uploaded material

---

**TC-9.1.1 — Empty topic field blocks notes generation request**
**Type:** UI

**Setup:** Authenticate a student on the notes generation page.

**Steps:**
1. Leave `[data-testid="input-notes-topic"]` empty.
2. Check `[data-testid="generate-notes-button"]` for `disabled` attribute.
3. Record any POST requests to `/notes/generate` during this check.

**Assertions:**
- `[data-testid="generate-notes-button"]` has the `disabled` attribute.
- No POST to `/notes/generate` was made.

---

**TC-9.1.2 — Notes generation with file_id retrieves top 15 chunks via hybrid search**
**Type:** UNIT

**Setup:** Mock retrieval service. A valid `file_id` is available.

**Steps:**
1. Call the notes generation service with `{"topic": "enzymes", "file_id": "test-file"}`.
2. Capture arguments passed to the retrieval mock.

**Assertions:**
- Retrieval was called with `top_k = 15` and `file_id = "test-file"`.
- Both vector and keyword search paths were triggered.

---

**TC-9.1.3 — Notes response contains all required structured fields with correct types**
**Type:** API

**Setup:** Mock GPT-4o to return a valid notes object.

**Steps:**
1. Send `POST /notes/generate` with `{"topic": "enzymes", "file_id": "test-file"}`.
2. Parse the response body.
3. Check for keys: `summary`, `key_concepts`, `important_details`, `common_misconceptions`.
4. Check types: `summary` is a string; `key_concepts` is an array; each element has `term`, `definition`, `example`; `important_details` is an array of strings; `common_misconceptions` is an array of strings.

**Assertions:**
- All four top-level keys are present.
- `summary` is a non-empty string.
- `key_concepts` is a non-empty array where every item has `term`, `definition`, and `example` as strings.
- `important_details` is an array of strings (may be empty, but key must exist).
- `common_misconceptions` is an array of strings (may be empty, but key must exist).

---

**TC-9.1.4 — Notes generation without file_id uses general knowledge and returns HTTP 200**
**Type:** API + UNIT

**Setup:** Mock retrieval service and OpenAI client.

**Steps:**
1. Send `POST /notes/generate` with `{"topic": "gravity"}` (no `file_id`).
2. Check whether the retrieval mock was called.
3. Check response status code.

**Assertions:**
- Retrieval mock was NOT called.
- Response status code is `200`.
- Response body contains all four required fields.

---

### Story 9.2 — Save generated notes

---

**TC-9.2.1 — Save button inserts notes record with correct user and file_id**
**Type:** UI + DB

**Setup:** Notes have been generated with `file_id = "f1"`. Authenticated student has `user_id = "u1"`.

**Steps:**
1. Click `[data-testid="save-notes-button"]`.
2. Wait for save confirmation.
3. Query the notes storage table: `SELECT created_by, file_id FROM student_notes WHERE created_by = 'u1' ORDER BY created_at DESC LIMIT 1` (table name per actual schema).

**Assertions:**
- Row exists with `created_by === "u1"` and `file_id === "f1"`.

---

**TC-9.2.2 — Save button shows confirmation and is not re-clickable for the same notes**
**Type:** UI

**Setup:** Notes have been generated.

**Steps:**
1. Click `[data-testid="save-notes-button"]`.
2. Wait for save to complete.
3. Check `[data-testid="save-notes-button"]` for `disabled` attribute or absence.
4. Check for `[data-testid="save-notes-confirmation"]`.

**Assertions:**
- `[data-testid="save-notes-confirmation"]` is visible.
- `[data-testid="save-notes-button"]` is absent or has `disabled` attribute.

---

**TC-9.2.3 — Saved notes appear on student dashboard**
**Type:** UI

**Setup:** A student has saved a set of notes.

**Steps:**
1. Navigate to `/student`.
2. Locate `[data-testid="notes-section"]`.
3. Collect all `[data-testid="note-card"]` elements.

**Assertions:**
- At least one `[data-testid="note-card"]` is present in the notes section.

---

**TC-9.2.4 — Saved notes appear under "My Notes" tab on student dashboard with link to /notes/:id**
**Type:** UI

**Setup:** Authenticated student. `GET /notes/my` mock returns 2 saved notes with known `id` values `n1`, `n2` and titles `"Notes A"`, `"Notes B"`.

**Steps:**
1. Navigate to `/student`.
2. Locate `[data-testid="my-notes-tab"]` and click it.
3. Collect all `[data-testid="my-note-card"]` elements.
4. For each, read its `data-note-id` and the `href` of its inner link.
5. Repeat the run with an empty `/notes/my` response and check the empty-state element.
6. Read the count badge on the My Notes tab.

**Assertions:**
- Two `[data-testid="my-note-card"]` elements are present.
- Their `data-note-id` values are exactly `["n1", "n2"]` (order-independent).
- Each card contains a link with `href` matching `/notes/{id}`.
- With empty response: `[data-testid="my-notes-empty"]` is visible and no `[data-testid="my-note-card"]` is rendered.
- The tab's count badge shows `"2"` when 2 notes exist.
- The Class Notes tab is unaffected (still renders class-notes data from its own source).

---

## Feature Group 10 — Instructor Notes System

### Story 10.1 — Create class notes

---

**TC-10.1.1 — Form is blocked when title or topic is empty; file_id is optional**
**Type:** UI

**Setup:** Authenticate an instructor on the class detail page.

**Steps:**
1. Leave all fields empty. Check `[data-testid="create-notes-submit"]` for `disabled`.
2. Fill `[data-testid="input-notes-title"]` with `"Lecture 1"`. Leave `[data-testid="input-notes-topic"]` empty. Check submit for `disabled`.
3. Clear title. Fill topic with `"Photosynthesis"`. Leave `[data-testid="input-notes-file-id"]` empty. Click submit.
4. Record whether a POST to `/notes/generate` was made in step 3.

**Assertions:**
- Step 1: submit button has `disabled`.
- Step 2: submit button has `disabled`.
- Step 3: POST to `/notes/generate` was made (form submits successfully without `file_id`).

---

**TC-10.1.2 — Submitting form stores class_notes row with is_published=false**
**Type:** UI + DB

**Setup:** Instructor submits form with `title = "Lecture 1"`, `topic = "Photosynthesis"`, no `file_id`. Class ID is known.

**Steps:**
1. Submit the form.
2. Wait for success indicator.
3. Query DB: `SELECT title, topic, is_published, class_id, created_by, content FROM class_notes WHERE class_id = '{class_id}' ORDER BY created_at DESC LIMIT 1`.

**Assertions:**
- `title === "Lecture 1"`.
- `topic === "Photosynthesis"`.
- `is_published === false`.
- `class_id` matches the current class.
- `created_by` matches the authenticated instructor's ID.
- `content` is a non-null JSON object.

---

**TC-10.1.3 — Newly created note appears in class detail notes list without page reload**
**Type:** UI

**Setup:** Authenticate an instructor on the class detail page. Count existing `[data-testid="note-list-item"]` elements as `N`.

**Steps:**
1. Submit the create notes form with valid data.
2. Without reloading, count `[data-testid="note-list-item"]` elements.

**Assertions:**
- The new count equals `N + 1`.

---

### Story 10.2 — Edit class notes

---

**TC-10.2.1 — Edit button opens inline editor; URL does not change**
**Type:** UI

**Setup:** A note exists in the class. Record `window.location.pathname`.

**Steps:**
1. Click `[data-testid="edit-note-button"][data-note-id="{note_id}"]`.
2. Check for `[data-testid="note-inline-editor"]`.
3. Check `window.location.pathname`.

**Assertions:**
- `[data-testid="note-inline-editor"]` is visible.
- `window.location.pathname` is unchanged from before the click.
- `[data-testid="note-read-view"][data-note-id="{note_id}"]` is no longer visible.

---

**TC-10.2.2 — Inline editor renders editable inputs for all five content fields**
**Type:** UI

**Setup:** The inline editor is open for a note with content in all fields.

**Steps:**
1. Check for `[data-testid="editor-title"]` as an input/textarea.
2. Check for `[data-testid="editor-summary"]` as an input/textarea.
3. Check for at least one `[data-testid="editor-key-concept-term"]` input.
4. Check for at least one `[data-testid="editor-key-concept-definition"]` input.
5. Check for at least one `[data-testid="editor-key-concept-example"]` input.
6. Check for at least one `[data-testid="editor-important-detail"]` input.
7. Check for at least one `[data-testid="editor-misconception"]` input.

**Assertions:**
- All seven elements are present in the DOM and are editable (`tagName === "INPUT"` or `"TEXTAREA"`, without `disabled` or `readonly`).

---

**TC-10.2.3 — Items can be added and removed from list fields**
**Type:** UI

**Setup:** Inline editor is open. Count existing `[data-testid="editor-key-concept-term"]` inputs as `K`.

**Steps:**
1. Click `[data-testid="add-key-concept-button"]`. Count inputs again.
2. Click `[data-testid="delete-key-concept-button"]:last-of-type`. Count inputs again.
3. Repeat add/delete for `important_details` and `misconceptions` using their respective buttons and inputs.

**Assertions:**
- After add: count equals `K + 1`.
- After delete: count equals `K`.
- Same add/delete behaviour verified for `important_details` and `misconceptions`.

---

**TC-10.2.4 — Save updates DB row; Cancel restores read view without DB changes**
**Type:** UI + DB

**Setup:** A note exists with `title = "Original Title"`. Open inline editor.

**Steps:**
1. Clear `[data-testid="editor-title"]` and type `"Updated Title"`.
2. Click `[data-testid="save-note-edit-button"]`.
3. Query DB: `SELECT title FROM class_notes WHERE id = '{note_id}'`.
4. Open the editor again. Clear title and type `"Discarded Title"`.
5. Click `[data-testid="cancel-note-edit-button"]`.
6. Query DB: `SELECT title FROM class_notes WHERE id = '{note_id}'`.
7. Check for `[data-testid="note-read-view"]`.

**Assertions:**
- After step 2: DB `title === "Updated Title"`.
- After step 5: DB `title === "Updated Title"` (unchanged; not `"Discarded Title"`).
- After step 5: `[data-testid="note-read-view"]` is visible.

---

### Story 10.3 — Publish and unpublish class notes

---

**TC-10.3.1 — Publish toggle updates is_published in DB**
**Type:** UI + DB

**Setup:** A note exists with `is_published = false`. Note its `note_id`.

**Steps:**
1. Click `[data-testid="publish-toggle"][data-note-id="{note_id}"]` to publish.
2. Query DB: `SELECT is_published FROM class_notes WHERE id = '{note_id}'`. Record as V1.
3. Click the toggle again to unpublish.
4. Query DB again. Record as V2.

**Assertions:**
- `V1 === true`.
- `V2 === false`.

---

**TC-10.3.2 — Unpublished note is absent from student view**
**Type:** UI

**Setup:** A note has `is_published = false`. A student is enrolled in the class.

**Steps:**
1. Log in as the student. Navigate to `/student`.
2. Collect all `data-note-id` attributes from `[data-testid="note-card"]`.

**Assertions:**
- The unpublished note's ID is NOT in the collected set.

---

**TC-10.3.3 — Published note appears on student dashboard and is accessible at /class-note/:id**
**Type:** UI

**Setup:** A note has `is_published = true`. Student is enrolled.

**Steps:**
1. Log in as student. Navigate to `/student`.
2. Confirm `[data-testid="note-card"][data-note-id="{note_id}"]` is present.
3. Click it.
4. Wait for navigation.

**Assertions:**
- `[data-testid="note-card"][data-note-id="{note_id}"]` is visible before click.
- After click: `window.location.pathname === "/class-note/{note_id}"`.
- `[data-testid="note-content"]` is present and visible on the destination page.

---

**TC-10.3.4 — Publish toggle reflects current is_published state on page load without user interaction**
**Type:** UI

**Setup:** Note A has `is_published = true`. Note B has `is_published = false`.

**Steps:**
1. Navigate to `/instructor/class/{class_id}`.
2. Read `aria-checked` of `[data-testid="publish-toggle"][data-note-id="{note_a_id}"]`.
3. Read `aria-checked` of `[data-testid="publish-toggle"][data-note-id="{note_b_id}"]`.

**Assertions:**
- Note A toggle: `aria-checked === "true"`.
- Note B toggle: `aria-checked === "false"`.

---

## Feature Group 11 — Flashcard Study

### Story 11.1 — Study a flashcard set

---

**TC-11.1.1 — Valid set ID renders cards; invalid ID shows not-found message without JS error**
**Type:** UI

**Setup:** A flashcard set with known `set_id` and at least 2 cards is seeded.

**Steps:**
1. Navigate to `/flashcards/{set_id}`. Check for `[data-testid="flashcard-content"]`.
2. Navigate to `/flashcards/00000000-0000-0000-0000-000000000000`. Listen for `page.on("pageerror")`. Check for `[data-testid="flashcard-not-found"]`.

**Assertions:**
- Valid ID: `[data-testid="flashcard-content"]` is visible; no `[data-testid="flashcard-not-found"]`.
- Invalid ID: `[data-testid="flashcard-not-found"]` is visible; no uncaught JS error was thrown.

---

**TC-11.1.2 — Card shows front by default; clicking reveals back**
**Type:** UI

**Setup:** A flashcard set is open. The first card has `front = "Q: What is ATP?"` and `back = "A: Adenosine triphosphate"`.

**Steps:**
1. Check `[data-testid="card-face"]` text content. Record as Face1.
2. Click `[data-testid="flashcard-card"]`.
3. Check `[data-testid="card-face"]` text content. Record as Face2.

**Assertions:**
- `Face1 === "Q: What is ATP?"` (front face shown by default).
- `Face2 === "A: Adenosine triphosphate"` (back face shown after click).

---

**TC-11.1.3 — Rating a card advances to the next card**
**Type:** UI

**Setup:** A flashcard set with at least 2 cards is open. The first card's front is `"Card 1 Front"`. The second card's front is `"Card 2 Front"`.

**Steps:**
1. Flip the card. Click `[data-testid="rate-know-button"]`.
2. Check `[data-testid="card-face"]` text content.

**Assertions:**
- `[data-testid="card-face"]` textContent === `"Card 2 Front"` (advanced to next card).

---

**TC-11.1.4 — Results summary shows correct Know, Almost, Nope counts after the last card**
**Type:** UI

**Setup:** A flashcard set with exactly 3 cards. Plan: rate card 1 as Know, card 2 as Almost, card 3 as Nope.

**Steps:**
1. Flip card 1. Click `[data-testid="rate-know-button"]`.
2. Flip card 2. Click `[data-testid="rate-almost-button"]`.
3. Flip card 3. Click `[data-testid="rate-nope-button"]`.
4. Read `[data-testid="result-know-count"]`, `[data-testid="result-almost-count"]`, `[data-testid="result-nope-count"]` text content.

**Assertions:**
- `result-know-count` textContent is `"1"` (or contains `"1"`).
- `result-almost-count` textContent is `"1"`.
- `result-nope-count` textContent is `"1"`.

---

### Story 11.2 — Restart a flashcard session

---

**TC-11.2.1 — Restart All shows full set; Retry Missed shows only Nope-rated cards**
**Type:** UI

**Setup:** A set with 3 cards (IDs: C1, C2, C3). In the session, rate C1 = Know, C2 = Nope, C3 = Nope.

**Steps:**
1. Complete the session with the above ratings. The results summary is shown.
2. Click `[data-testid="retry-missed-button"]`.
3. Navigate through all cards. Collect all card `data-card-id` attributes shown.
4. Complete the retry session.
5. Click `[data-testid="restart-all-button"]`.
6. Navigate through all cards. Collect all `data-card-id` attributes shown.

**Assertions:**
- After step 3: only C2 and C3 appear (exactly 2 cards; C1 is absent).
- After step 6: C1, C2, and C3 all appear (exactly 3 cards).

---

**TC-11.2.2 — Retry Missed with zero Nope ratings restarts with the full card set**
**Type:** UI

**Setup:** A set with 2 cards. Rate both as Know.

**Steps:**
1. Complete the session with all Know ratings.
2. Click `[data-testid="retry-missed-button"]`.
3. Count `[data-testid="flashcard-card"]` elements navigated through.

**Assertions:**
- All 2 cards are presented (not an empty set or 0 cards).

---

**TC-11.2.3 — Restarting resets index to 0, clears ratings, shows front of first card**
**Type:** UI

**Setup:** A set with 2 cards has just been completed. Results summary is shown.

**Steps:**
1. Click `[data-testid="restart-all-button"]`.
2. Check `[data-testid="card-index-indicator"]` text content (e.g. "1 / 2" or "Card 1").
3. Check `[data-testid="card-face"]` text content matches the first card's front.
4. Check whether any rating buttons from the previous session are pre-selected.

**Assertions:**
- Card index indicator shows card 1 of N.
- `[data-testid="card-face"]` shows the first card's front text (not the back).
- No rating button has an active/selected state.

---

### Story 11.3 — Edit a flashcard set

---

**TC-11.3.1 — Edit link on flashcard study page navigates to /flashcards/:id/edit**
**Type:** UI

**Setup:** A flashcard set is open at `/flashcards/{set_id}`.

**Steps:**
1. Click `[data-testid="edit-flashcards-link"]`.
2. Wait for navigation.

**Assertions:**
- `window.location.pathname === "/flashcards/{set_id}/edit"`.

---

**TC-11.3.2 — Editor renders front and back of each card as editable inputs**
**Type:** UI

**Setup:** A flashcard set with 2 cards is open in the editor.

**Steps:**
1. Count `[data-testid="card-front-input"]` elements.
2. Count `[data-testid="card-back-input"]` elements.
3. Type `"New Front"` into the first `[data-testid="card-front-input"]`.
4. Check the input value.

**Assertions:**
- Count of `card-front-input` equals 2.
- Count of `card-back-input` equals 2.
- First `card-front-input` value is `"New Front"` after typing.

---

**TC-11.3.3 — Adding a card appends a new editable row; deleting a card removes it**
**Type:** UI

**Setup:** Flashcard editor is open with 2 cards. Count initial `[data-testid="card-front-input"]` as `N = 2`.

**Steps:**
1. Click `[data-testid="add-card-button"]`. Count inputs.
2. Click `[data-testid="delete-card-button"]:last-of-type`. Count inputs.

**Assertions:**
- After add: `[data-testid="card-front-input"]` count equals `N + 1 = 3`.
- After delete: count equals `N = 2`.
- The newly added card's inputs are empty (`value === ""`).

---

**TC-11.3.4 — Saving updates the cards jsonb in flashcard_sets**
**Type:** UI + DB

**Setup:** Editor is open. First card originally has `front = "Old Front"`.

**Steps:**
1. Clear `[data-testid="card-front-input"]:first-of-type` and type `"New Front"`.
2. Click `[data-testid="save-flashcards-button"]`.
3. Wait for save confirmation.
4. Query DB: `SELECT cards FROM flashcard_sets WHERE id = '{set_id}'`.
5. Parse the `cards` JSON array. Find the first card's `front` value.

**Assertions:**
- The first card's `front` in the DB JSON equals `"New Front"`.

---

**TC-11.3.5 — Editor blocks save when current user does not own the set**
**Type:** UI

**Setup (Part A):** Authenticated user A loads `/flashcards/{set_id}/edit` for a set where `created_by = user A`.
**Setup (Part B):** Authenticated user B loads `/flashcards/{set_id}/edit` for a set where `created_by = user A`.

**Steps (Part A):**
1. Render the editor page.
2. Check for `[data-testid="flashcard-editor-form"]`.

**Steps (Part B):**
1. Render the editor page.
2. Check for `[data-testid="flashcard-editor-ownership-error"]`.
3. Check for `[data-testid="flashcard-editor-form"]`.

**Assertions (Part A):**
- `[data-testid="flashcard-editor-form"]` is present and editable.

**Assertions (Part B):**
- `[data-testid="flashcard-editor-ownership-error"]` is visible with a message indicating the user does not own the set.
- `[data-testid="flashcard-editor-form"]` is NOT present.
- No PUT to `/flashcards/{set_id}` can be made from this page state.

---

## Feature Group 12 — Theme Preferences

### Story 12.1 — Toggle dark mode

---

**TC-12.1.1 — Theme toggle is present in the navigation bar on every authenticated page**
**Type:** UI

**Setup:** Authenticate a user (run once as instructor, once as student).

**Steps:**
1. For each of the following paths, navigate to the route and check for `[data-testid="theme-toggle"]` in `[data-testid="top-nav"]`:
   - `/instructor`, `/student`, `/instructor/class/{class_id}`, `/quiz/{quiz_id}`, `/flashcards/{set_id}`, `/class-note/{note_id}`, and the upload/generate pages.

**Assertions:**
- `[data-testid="theme-toggle"]` is present within `[data-testid="top-nav"]` on every listed route.

---

**TC-12.1.2 — Clicking the toggle switches the dark class on <html> within 100ms without reload**
**Type:** UI

**Setup:** A user is authenticated. Current theme is light (`<html>` does NOT have `class="dark"`).

**Steps:**
1. Record `document.documentElement.classList.contains("dark")` as `Before`.
2. Record the current timestamp as `T1`.
3. Click `[data-testid="theme-toggle"]`.
4. Poll `document.documentElement.classList.contains("dark")` until truthy or 200ms elapsed. Record timestamp when truthy as `T2`.
5. Verify no full page reload occurred (the DOM was not re-initialized: check a stable element's identity).

**Assertions:**
- `Before === false`.
- `document.documentElement.classList.contains("dark") === true` after the click.
- `T2 - T1 < 100` (milliseconds).
- No page reload occurred (DOM element identity preserved).

---

**TC-12.1.3 — Theme is written to localStorage under aq_theme synchronously on toggle**
**Type:** UI

**Setup:** A user is authenticated.

**Steps:**
1. Click `[data-testid="theme-toggle"]`.
2. Immediately (next microtask) read `localStorage.getItem("aq_theme")`.

**Assertions:**
- `localStorage.getItem("aq_theme")` is either `"dark"` or `"light"` (non-null, non-empty).
- The value matches the currently active theme on `<html>`.

---

**TC-12.1.4 — Stored theme is applied before first paint; absent key uses OS preference**
**Type:** UI

**Setup (Part A):** Set `localStorage.setItem("aq_theme", "dark")` before page load.
**Setup (Part B):** Clear `aq_theme` from `localStorage`. Set the browser's `prefers-color-scheme` to `dark` via `page.emulateMedia({ colorScheme: "dark" })`.

**Steps (Part A):**
1. Load the page.
2. In the `page.on("load")` event (before any frame renders), evaluate `document.documentElement.classList.contains("dark")`.

**Steps (Part B):**
1. Load the page.
2. After load, evaluate `document.documentElement.classList.contains("dark")`.

**Assertions (Part A):**
- `document.documentElement.classList.contains("dark") === true` at load time (no flash of light theme).

**Assertions (Part B):**
- `document.documentElement.classList.contains("dark") === true` after load (OS preference respected).

---

**TC-12.1.5 — OS preference change updates theme live only before user explicitly toggles**
**Type:** UI

**Setup:** `aq_theme` is absent from `localStorage`. Browser starts with `prefers-color-scheme: light`.

**Steps:**
1. Load the page. Verify `<html>` does not have `class="dark"`.
2. Change media to `prefers-color-scheme: dark` via `page.emulateMedia({ colorScheme: "dark" })`.
3. Wait 500ms. Evaluate `document.documentElement.classList.contains("dark")`. Record as `R1`.
4. Explicitly click `[data-testid="theme-toggle"]` once (user action recorded).
5. Change media back to `prefers-color-scheme: light`.
6. Wait 500ms. Evaluate `document.documentElement.classList.contains("dark")`. Record as `R2`.

**Assertions:**
- `R1 === true` (app followed OS before user toggled).
- `R2` equals whatever the theme was after step 4's toggle (the OS change in step 5 did NOT override it). If the toggle switched to light, `R2 === false`; the app ignored the redundant OS signal.

---

**TC-12.1.6 — No element renders same-color text on background in dark mode**
**Type:** UI

**Setup:** Dark mode is active. Use axe-core or Playwright's accessibility snapshot.

**Steps:**
1. For each authenticated route, run `axe.run(document, { rules: { "color-contrast": { enabled: true } } })`.
2. Collect all violations with `id === "color-contrast"`.
3. Additionally, programmatically query all visible text elements and compare computed `color` vs computed `backgroundColor` via `getComputedStyle`. Flag any element where both values resolve to the same RGB.

**Assertions:**
- Zero axe violations with `id === "color-contrast"` on any route.
- Zero text elements where `getComputedStyle(el).color === getComputedStyle(el).backgroundColor` for non-transparent backgrounds.

---

**TC-12.1.7 — Dark mode text meets WCAG 2.1 AA contrast ratios**
**Type:** UI

**Setup:** Dark mode is active. Use axe-core with WCAG AA ruleset.

**Steps:**
1. For each authenticated route, run `axe.run(document, { runOnly: { type: "tag", values: ["wcag2aa"] } })`.
2. Collect violations where `id === "color-contrast"`.

**Assertions:**
- Zero WCAG 2.1 AA color-contrast violations on any authenticated route in dark mode.
- (Equivalent manual check: body text contrast ratio ≥ 4.5:1; large text contrast ratio ≥ 3:1 — these are subsumed by the axe rule check above.)

---

**TC-12.1.8 — Theme preference propagates to other tabs within 1 second via storage event**
**Type:** UI

**Setup:** Two browser contexts sharing the same origin are open. Both start with `aq_theme = "light"`.

**Steps:**
1. In Context A, click `[data-testid="theme-toggle"]`. Record toggle time as `T1`.
2. In Context B, poll `document.documentElement.classList.contains("dark")` every 100ms for up to 1500ms. Record the first timestamp when it becomes `true` as `T2`.

**Assertions:**
- `T2` is non-null (the change was detected in Context B).
- `T2 - T1 <= 1000` (milliseconds).
- `localStorage.getItem("aq_theme")` in Context B equals `"dark"` after the change.

---

## Feature Group 13 — User Profile (Avatar & Display Name)

**TC-13.1.1 — Profile page is protected and requires authentication**
**Type:** Routing

**Setup:** No user is logged in.

**Steps:**
1. Navigate to `/profile`.
2. Observe the page state and URL.

**Assertions:**
- The browser is redirected to `/login`.
- The profile page is not rendered.

---

**TC-13.1.2 — Profile page renders current user details in preview block**
**Type:** UI / Component

**Setup:** An authenticated user (student or instructor) is logged in with:
- `full_name = "Alice Smith"`
- `email = "alice@example.com"`
- `role = "student"`
- `avatar_url = null` (not yet set)

**Steps:**
1. Navigate to `/profile`.
2. Wait for the page to load.
3. Locate the preview block (e.g., `[data-testid="profile-preview"]`).
4. Verify the displayed text and icon.

**Assertions:**
- The preview block displays "Alice Smith" as the display name.
- The preview block displays "alice@example.com" as the email.
- The preview block displays "Student" (capitalised) as the role.
- When `avatar_url` is null, a `<User>` lucide icon is displayed in the preview instead of an image.

---

**TC-13.1.3 — Display name input is pre-filled and validates length**
**Type:** UI / Component

**Setup:** An authenticated user with `full_name = "Bob Jones"` navigates to `/profile`.

**Steps:**
1. Locate the display-name input field (e.g., `[data-testid="input-full-name"]`).
2. Verify the input's current value.
3. Clear the input to empty string.
4. Verify the Save button state.
5. Type 81 characters into the input.
6. Verify the input's rendered value and Save button state.

**Assertions:**
- The input is initially pre-filled with "Bob Jones".
- The input has `required` and `minLength="1"` attributes.
- When the input is empty or contains only whitespace, the Save button is disabled.
- When the input exceeds 80 characters, the input's `maxLength="80"` prevents further typing or truncates at 80.
- When the input contains a valid non-empty value (1–80 characters, trimmed), the Save button is enabled.

---

**TC-13.1.4 — Avatar picker renders presets and highlights selection**
**Type:** UI / Component

**Setup:** An authenticated user navigates to `/profile`. The avatar picker is visible.

**Steps:**
1. Count the number of preset avatar buttons displayed (e.g., `[data-testid="avatar-preset"]`).
2. Click the first preset button.
3. Observe the preview block and the picker button states.
4. Click a different preset button.
5. Observe the changes.

**Assertions:**
- Exactly 8 preset avatar buttons are rendered.
- Each button displays an avatar image with a DiceBear URL (e.g., `https://api.dicebear.com/7.x/avataaars/svg?seed=<seed>`).
- Clicking a preset does NOT immediately call `supabase.from("profiles").update()` (no network call yet).
- The preview block's avatar image updates immediately to the clicked preset's avatar.
- The clicked preset button has a visible selected state (e.g., ring or border style). Other buttons do not.

---

**TC-13.2.1 — Save button calls Supabase update with correct parameters**
**Type:** Component / Integration

**Setup:** An authenticated user with `id = "user-123"` is on the profile page. The display name has been changed to "Charlie Brown" and an avatar preset has been selected (e.g., `https://api.dicebear.com/7.x/avataaars/svg?seed=violet`). Mock `supabase.from("profiles").update(...).eq(...)` to track the call.

**Steps:**
1. Click the Save button.
2. Capture the Supabase call.
3. Verify the call's chain.

**Assertions:**
- `supabase.from("profiles")` is called once.
- `.update({ full_name: "Charlie Brown", avatar_url: "https://api.dicebear.com/7.x/avataaars/svg?seed=violet" })` is chained.
- `.eq("id", "user-123")` is chained (no other rows are targeted).
- No other fields (`email`, `role`, `created_at`, `id`) are included in the update object.

---

**TC-13.2.2 — Save success shows confirmation and reloads page**
**Type:** Component / Integration

**Setup:** The profile form is ready to submit. Mock `supabase.from("profiles").update(...).eq(...)` to resolve successfully. Mock `window.location.reload` to a spy function.

**Steps:**
1. Click the Save button.
2. Wait for the async update to resolve.
3. Observe the success message and button state.
4. Verify the page reload call.

**Assertions:**
- While the request is in flight, the Save button displays a loading state (e.g., spinner or disabled text) and is disabled.
- On success, a confirmation message is displayed (e.g., "Profile updated successfully").
- After ~600ms, `window.location.reload()` is called (the spy confirms the call).
- After reload, the cached `AuthContext` profile is refreshed.

---

**TC-13.2.3 — Save error displays inline message and leaves form editable**
**Type:** Component / Integration

**Setup:** The profile form is ready to submit. Mock `supabase.from("profiles").update(...).eq(...)` to reject with error `{ message: "Database error: update failed" }`.

**Steps:**
1. Click the Save button.
2. Wait for the async update to reject.
3. Observe the error message and button state.
4. Verify the form is still editable.

**Assertions:**
- The error message "Database error: update failed" is displayed inline (e.g., in a red error block).
- The Save button returns to its normal enabled state.
- The display-name input remains editable and retains the user's last input.
- The avatar picker remains clickable and functional.

---

**TC-13.2.4 — RLS prevents a user from updating another user's profile**
**Type:** Backend / Integration (Supabase RLS)

**Setup:** Two test users: `user-a-id` and `user-b-id`. Supabase RLS on `profiles` enforces `auth.uid() = id` for UPDATE.

**Steps:**
1. As `user-a`, attempt to call `supabase.from("profiles").update({ full_name: "Hacker" }).eq("id", "user-b-id")`.
2. Observe the Supabase response.

**Assertions:**
- The update is rejected by RLS.
- The response contains an error (e.g., HTTP 403 or PGRST error code).
- `user-b`'s profile row is unchanged.

---

**TC-13.3.1 — Navbar displays avatar image when avatar_url is set**
**Type:** UI / Component

**Setup:** An authenticated user with `avatar_url = "https://api.dicebear.com/7.x/avataaars/svg?seed=mint"` is logged in.

**Steps:**
1. Load any authenticated page (e.g., `/student` or `/instructor`).
2. Locate the navbar (e.g., `[data-testid="navbar"]`).
3. Find the avatar region on the right side of the navbar.
4. Verify the avatar element.

**Assertions:**
- An `<img>` element is rendered in the navbar's right-side avatar region.
- The `src` attribute is set to the user's `avatar_url`.
- The image has a circular style (e.g., `rounded-full` or `border-radius: 50%`).

---

**TC-13.3.2 — Navbar displays fallback icon when avatar_url is null**
**Type:** UI / Component

**Setup:** An authenticated user with `avatar_url = null` is logged in.

**Steps:**
1. Load any authenticated page (e.g., `/student` or `/instructor`).
2. Locate the navbar's right-side avatar region.
3. Verify the fallback element.

**Assertions:**
- No `<img>` element is rendered in the avatar region.
- A `<User>` lucide icon is displayed instead.
- The icon is inside a neutral-coloured circle (e.g., `bg-gray-100`).

---

**TC-13.3.3 — Avatar region links to profile page**
**Type:** UI / Component

**Setup:** An authenticated user is logged in. The navbar is rendered.

**Steps:**
1. Locate the avatar region in the navbar (either the `<img>` or `<User>` icon).
2. Verify the parent link element.
3. Click the avatar region.
4. Observe the navigation.

**Assertions:**
- The avatar region (whether image or icon) is wrapped in a `<Link to="/profile">`.
- Clicking the avatar navigates to the profile page (`/profile`).
- The page transitions to the profile page without a full reload.

---

**TC-13.3.4 — Logout button remains functional with avatar link**
**Type:** UI / Component

**Setup:** An authenticated user is logged in. The navbar is rendered with both the avatar link and the Logout button.

**Steps:**
1. Locate the Logout button (e.g., `[data-testid="logout-button"]`).
2. Click the Logout button.
3. Observe the logout flow.

**Assertions:**
- The Logout button is still clickable and not obscured by the avatar link.
- Clicking the Logout button calls `supabase.signOut()`.
- The user is redirected to `/login`.
- The `aq_profile` key is cleared from `localStorage`.
- The user's session is terminated.

---

## Feature Group 14 — §14.3 Event Catalog Completeness

> **Source:** `specs/feat-014-event-catalog-completeness.md`. This feature has eight stories rather than the usual one or two, because each story closes a distinct emission gap from audit issue #38.
>
> **AC numbering:** the per-feature spec numbers ACs as `AC-1`, `AC-2`, ... within each story rather than `AC-14.X.Y`. TCs in this section adopt `TC-14.S.A` where `S` is the story number and `A` is the AC index within the story.

### Story 14.1 — Upload route emits file-acceptance events

---

**TC-14.1.1 — upload.file.accepted is emitted on every successful acceptance with mime_type and size_bytes meta**
**Type:** API

**Setup:** Mock `app.core.logging.log_event`. Authenticated user. Valid PDF payload under 50MB.

**Steps:**
1. POST a valid PDF to `/upload/`.
2. Inspect the `log_event` mock call list for `event="upload.file.accepted"`.

**Assertions:**
- `log_event` was called exactly once with `event="upload.file.accepted"`.
- `meta` contains `mime_type` and `size_bytes` (both non-null).

---

**TC-14.1.2 — upload.file.rejected is emitted on every rejected upload with WARNING level and reason meta**
**Type:** API

**Setup:** Mock `log_event`. Authenticated user.

**Steps:**
1. POST a `.txt` file (extension rejection) to `/upload/`.
2. POST a 60MB PDF (size rejection) to `/upload/`.
3. Inspect `log_event` mock for both calls.

**Assertions:**
- Both POSTs produce a `log_event` call with `event="upload.file.rejected"`, `level="WARNING"`, `outcome="failure"`.
- The first call's `meta` contains `reason="ext"` and `size_bytes`.
- The second call's `meta` contains `reason="size"` and `size_bytes`.

---

**TC-14.1.3 — upload events do not include PII (file names, emails, content)**
**Type:** API

**Setup:** Mock `log_event`. Submit a file named `student_report_card.pdf`.

**Steps:**
1. Submit valid and rejected uploads.
2. Inspect every `log_event` call's `meta` keys/values.

**Assertions:**
- No `log_event` call's `meta` contains the file name `student_report_card.pdf` or any substring of it.
- No `log_event` call contains an email-shaped string.
- No `log_event` call contains file content bytes.

---

### Story 14.2 — Retrieval service emits search-completion event

---

**TC-14.2.1 — retrieval.search.completed is emitted after every search with top_k, chunks_returned, fallback_keyword, duration_ms**
**Type:** UNIT

**Setup:** Mock `log_event`. Mock vector + keyword search functions.

**Steps:**
1. Call `hybrid_search(topic="enzymes", file_id="f1", top_k=12)`.
2. Inspect the `log_event` call.

**Assertions:**
- `log_event` was called once with `event="retrieval.search.completed"`.
- `meta` contains `top_k=12`, `chunks_returned=<int>`, `fallback_keyword=<bool>`.
- `duration_ms` is a positive integer.

---

**TC-14.2.2 — retrieval.search.completed fires on both success and failure outcomes**
**Type:** UNIT

**Setup:** Mock `log_event`. Two scenarios: (a) successful search; (b) search throws.

**Steps:**
1. Run scenario (a). Capture the `log_event` call.
2. Run scenario (b). Capture the `log_event` call.

**Assertions:**
- (a) `log_event` call has `outcome="success"`.
- (b) `log_event` call has `outcome="failure"`.

---

### Story 14.3 — Notes-gen service emits lifecycle events

---

**TC-14.3.1 — notes.generate.started is emitted before the LLM call with outside_sources meta**
**Type:** UNIT

**Setup:** Mock `log_event`. Mock OpenAI client to record call order.

**Steps:**
1. Call `generate_notes(topic="x", file_id=None, outside_sources=True)`.
2. Inspect the order of `log_event` and OpenAI mock calls.

**Assertions:**
- `log_event("notes.generate.started", ...)` is called before any OpenAI mock call.
- `meta` contains `outside_sources=True`.

---

**TC-14.3.2 — notes.generate.completed is emitted on success with duration_ms and {has_file, prompt_tokens}**
**Type:** UNIT

**Setup:** Mock `log_event`. Mock OpenAI to return a valid response with known `usage.prompt_tokens`.

**Steps:**
1. Call `generate_notes(topic="x", file_id="f1")`.
2. Inspect the success-path `log_event` call.

**Assertions:**
- `log_event` is called with `event="notes.generate.completed"`.
- `duration_ms > 0`.
- `meta` contains `has_file=True`, `prompt_tokens=<int>`.

---

**TC-14.3.3 — notes.generate.failed is emitted on exception with error_code, exception_type, duration_ms**
**Type:** UNIT

**Setup:** Mock `log_event`. Mock OpenAI to raise an exception.

**Steps:**
1. Call `generate_notes(topic="x", file_id=None)` and catch the exception.
2. Inspect the failure-path `log_event` call.

**Assertions:**
- `log_event` is called with `event="notes.generate.failed"`, `level="ERROR"`, `outcome="failure"`.
- `meta` contains `error_code` and `exception_type`.
- `duration_ms > 0`.

---

### Story 14.4 — Notes route emits publish-toggle event

---

**TC-14.4.1 — notes.publish.toggled is emitted on every publish/unpublish with note_id and is_published meta**
**Type:** API

**Setup:** Mock `log_event` and `supabase_client`. Authenticated instructor with an existing class note.

**Steps:**
1. PATCH the note's publish state to true.
2. PATCH it back to false.
3. Inspect `log_event` calls.

**Assertions:**
- Two `log_event("notes.publish.toggled", ...)` calls occurred.
- First call's `meta` has `note_id=<id>`, `is_published=True`.
- Second call's `meta` has `is_published=False`.

---

**TC-14.4.2 — notes.publish.toggled fires only after successful DB write**
**Type:** API

**Setup:** Mock `log_event`. Mock `supabase_client.update` to raise.

**Steps:**
1. PATCH the note's publish state.
2. Inspect `log_event` calls.

**Assertions:**
- No `notes.publish.toggled` `log_event` call was made when the DB update failed.

---

### Story 14.5 — Flashcards route emits set-lifecycle events

---

**TC-14.5.1 — flashcard.set.created is emitted on creation with set_id, card_count, set_type meta**
**Type:** API

**Setup:** Mock `log_event` and `supabase_client`. Authenticated user.

**Steps:**
1. POST `/flashcards/` with a 3-card payload and `set_type="manual"`.
2. Inspect `log_event` mock.

**Assertions:**
- `log_event("flashcard.set.created", ...)` was called once.
- `meta` contains `set_id=<uuid>`, `card_count=3`, `set_type="manual"`.

---

**TC-14.5.2 — flashcard.set.shared is emitted on share action with set_id and scope meta**
**Type:** API

**Setup:** Mock `log_event` and `supabase_client`. An existing flashcard set owned by the authenticated user.

**Steps:**
1. PATCH `/flashcards/{set_id}/share` with `{"scope": "class"}`.
2. Inspect `log_event` mock.
3. Repeat with `{"scope": "public"}`.

**Assertions:**
- Both calls produce a `log_event("flashcard.set.shared", ...)` with `meta.set_id=<set_id>` and `meta.scope` matching the request.

---

### Story 14.6 — Classes route emits member-removal event

---

**TC-14.6.1 — class.member.removed is emitted on every removal with class_id and removed_by_instructor meta**
**Type:** API

**Setup:** Mock `log_event` and `supabase_client`. Authenticated instructor; a class with one member.

**Steps:**
1. DELETE the class member via the appropriate route.
2. Inspect `log_event` mock.

**Assertions:**
- `log_event("class.member.removed", ...)` was called once.
- `meta` contains `class_id=<id>`, `removed_by_instructor=True`.

---

**TC-14.6.2 — class.member.removed fires only after the DB delete succeeds**
**Type:** API

**Setup:** Mock `log_event`. Mock `supabase_client.delete` to raise.

**Steps:**
1. DELETE the class member.
2. Inspect `log_event` mock.

**Assertions:**
- No `class.member.removed` call was made when the DB delete failed.

---

### Story 14.7 — Resolve un-cataloged quiz.load.completed event

---

**TC-14.7.1 — quiz.load.completed is either documented in DESIGN.md §14.3 or absent from the codebase**
**Type:** UNIT

**Setup:** Read both `docs/DESIGN.md` and the backend source tree.

**Steps:**
1. Grep `docs/DESIGN.md` for a §14.3 catalog table row containing `quiz.load.completed`.
2. Grep `backend/` for any `log_event("quiz.load.completed", ...)` call.

**Assertions:**
- Exactly one of these is true:
  - The DESIGN.md grep returns at least one §14.3 catalog row AND backend grep may return any number of results.
  - OR the backend grep returns zero results.

---

### Story 14.8 — Frontend emits auth-lifecycle and profile events

---

**TC-14.8.1 — logEvent shim exists in frontend and writes a §14.1-conformant envelope to console.info**
**Type:** UI

**Setup:** Spy on `console.info`.

**Steps:**
1. Import `logEvent` from `frontend/src/utils/logEvent.js` (or equivalent).
2. Call `logEvent("test.event", {actor_id: "u1", outcome: "success"})`.
3. Inspect the latest `console.info` call.

**Assertions:**
- `logEvent` is exported as a function.
- The logged object contains `event="test.event"`, `outcome="success"`, `level`, `timestamp`, and `actor_id="u1"`.

---

**TC-14.8.2 — AuthContext emits auth.session.started on sign-in and auth.session.ended on sign-out**
**Type:** UI

**Setup:** Spy on `logEvent`. Mock Supabase auth.

**Steps:**
1. Trigger a sign-in flow that resolves with a valid session.
2. Trigger a sign-out flow.
3. Inspect spy calls.

**Assertions:**
- `logEvent("auth.session.started", ...)` is called once after sign-in.
- `logEvent("auth.session.ended", ...)` is called once after sign-out.

---

**TC-14.8.3 — Profile page emits profile.updated with fields_changed after successful update**
**Type:** UI

**Setup:** Spy on `logEvent`. Mock the Supabase profile update to succeed.

**Steps:**
1. Render the profile page.
2. Change `full_name` and click Save.
3. Inspect spy calls.

**Assertions:**
- `logEvent("profile.updated", {fields_changed: [...]})` is called exactly once after success.
- `fields_changed` is an array containing `"full_name"`.

---

**TC-14.8.4 — No PII (email, display name, avatar URL) appears in any logged field**
**Type:** UI

**Setup:** Spy on `logEvent`. Authenticated user with `email="test@example.com"`, `full_name="Test Name"`, `avatar_url="https://api.dicebear.com/...?seed=zen"`.

**Steps:**
1. Trigger sign-in, sign-out, and a profile update.
2. Inspect every spy call.

**Assertions:**
- No call's payload (top-level or `meta`) contains the email string `"test@example.com"`.
- No call contains `"Test Name"` or any substring.
- No call contains the full `avatar_url` string.