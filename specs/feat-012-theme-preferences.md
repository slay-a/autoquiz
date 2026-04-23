# Feature Brief: Theme Preferences (Dark Mode)

---

## 1. Summary

**Feature:** Users can switch the app between light and dark colour themes via a toggle in the top navigation. The preference is persisted in `localStorage`, applied synchronously on page load to avoid a flash of incorrect theme, falls back to the OS `prefers-color-scheme` when no explicit preference is stored, and syncs across open tabs.
**Requested by:** Any authenticated user (instructor or student)
**Priority:** P2

This feature is **not yet implemented**. The spec defines the intended behaviour for the prototyper to build.

---

## 2. User Stories

### Story 12.1 — Toggle dark mode

**As a** user (instructor or student),
**I want** to switch the app between light and dark colour themes,
**so that** I can reduce eye strain in low-light environments and match my system preferences.

**Acceptance Criteria:**
- [x] AC-12.1.1: A theme toggle control is rendered in the top navigation bar on every authenticated page (instructor dashboard, student dashboard, class detail, quiz study, flashcard study, notes view, upload/generation pages). The control displays a moon icon in light mode and a sun icon in dark mode (indicating the theme that will be activated on click).
- [x] AC-12.1.2: Clicking the toggle switches the active theme between `light` and `dark` by adding or removing the `dark` class on the root `<html>` element. The visual change occurs within 100ms without a page reload.
- [x] AC-12.1.3: The selected theme is persisted to `localStorage` under the key `aq_theme` with the value `"light"` or `"dark"`. The value is written synchronously on every toggle.
- [x] AC-12.1.4: On initial page load, the app reads `aq_theme` from `localStorage` and applies the stored theme before the first paint (via an inline `<script>` in `index.html` that runs before React mounts). If no value is stored, the app falls back to the OS preference via the `prefers-color-scheme: dark` media query.
- [x] AC-12.1.5: When `aq_theme` is absent and the OS `prefers-color-scheme` changes while the app is open, the app updates the theme live to match the OS preference. Once the user has explicitly toggled the theme (i.e. `aq_theme` is set), subsequent OS preference changes are ignored.
- [x] AC-12.1.6: In dark mode, every page renders with dark backgrounds and light-on-dark text. No element renders with unreadable combinations (black text on black background, white text on white background). Login and registration pages are also themed.
- [x] AC-12.1.7: Text in dark mode meets WCAG 2.1 AA contrast requirements: body text has a contrast ratio of at least 4.5:1 against its background, and large text (≥18pt or ≥14pt bold) has a contrast ratio of at least 3:1.
- [x] AC-12.1.8: The theme preference is applied consistently across browser tabs of the same origin — toggling in one tab updates other open tabs within 1 second via a `storage` event listener on `window`.

---

## 3. Role & Access Rules

| Actor | Allowed action | Denied action | Enforced at |
|-------|----------------|---------------|-------------|
| Student | Toggle theme, theme persists to their localStorage | — | Client-only (no server state) |
| Instructor | Toggle theme, theme persists to their localStorage | — | Client-only (no server state) |
| Unauthenticated | Toggle theme on login/register pages; preference persists to the device's localStorage | — | Client-only |

> Theme preference is device-scoped, not user-scoped. Logging out or switching accounts on the same device does not reset the theme.

---

## 4. Design Decisions

### 4a. Data persistence

- **Persisted to DB?** No
- **Persisted to localStorage?** Yes, under key `aq_theme` with value `"light"` or `"dark"`
- **Migration required:** No
- **User-scoped vs device-scoped:** Device-scoped. The preference is stored on the device and shared across all users who log in on it.

### 4b. Backend architecture

- **No FastAPI routes, no DB tables, no migrations.** This is a pure frontend feature.

### 4c. Frontend architecture

- **Tailwind `darkMode: 'class'`:** `frontend/tailwind.config.js` must add `darkMode: 'class'` so `dark:` variants apply when the `<html>` element has class `dark`.
- **Pre-paint theme application:** `frontend/index.html` must include an inline `<script>` in `<head>` that reads `localStorage.getItem('aq_theme')` and applies the `dark` class to `document.documentElement` before React mounts. This prevents a flash of incorrect theme (FOIT).
- **New component:** `frontend/src/components/ThemeToggle.jsx` — renders a button with moon/sun icon (from `lucide-react`), reads current theme from context, toggles on click.
- **New context:** `frontend/src/contexts/ThemeContext.jsx` — exposes `{ theme, setTheme, toggleTheme }`. On mount, reads `aq_theme` from localStorage, subscribes to `prefers-color-scheme` media query (only follows OS when `aq_theme` is absent), and subscribes to `storage` events on `window` (for cross-tab sync).
- **Top-nav integration:** No shared `TopBar` component currently exists — each page renders its own header. The prototyper must either (a) introduce a shared `TopBar` that includes `<ThemeToggle />` and refactor each page to use it, or (b) insert `<ThemeToggle />` into each page's existing header. Option (a) is preferred — see Open Question 1.
- **Dark-mode styles:** Apply Tailwind `dark:` variant classes (e.g., `bg-white dark:bg-slate-900`, `text-slate-900 dark:text-slate-100`) throughout all page and component files. Use a single slate-based palette for dark backgrounds (`slate-900` primary, `slate-800` cards, `slate-700` borders) to keep the audit scope bounded.
- **State scope:** Theme lives in `ThemeContext` at the app root. `<ThemeProvider>` wraps `<App />` in `main.jsx`.
- **No secrets in client-side code:** N/A — no network calls.

### 4d. RAG pipeline impact

- **Affects chunking?** No.
- **Affects embedding?** No.
- **Affects retrieval query?** No.
- **Affects LLM prompt?** No.

### 4e. Security considerations

- **No auth, no DB, no API surface.** Theme value is a short string in localStorage — no PII, no credentials, no injection risk.
- **`storage` event listener:** Listens only for the `aq_theme` key and writes to `document.documentElement.classList` — no `eval`, no `innerHTML`, no XSS vector.
- **Inline script in `index.html`:** The pre-paint script is static (no user input interpolation) and safe. Ensure the app's CSP (if any is later added) includes a hash or nonce for this inline script.

---

## 5. Out of Scope

- Persisting theme per-user in the database (device-scoped is the explicit design)
- Syncing theme across devices for the same user
- Themes other than light and dark (no high-contrast, no custom colour themes)
- Per-page or per-component theme overrides
- Animated theme transitions beyond Tailwind's default colour transitions
- Accessibility features beyond the WCAG AA contrast requirement in AC-12.1.7 (e.g., reduced-motion, font-size controls)
- Theming of third-party embeds (e.g., PDF preview iframes)

---

## 6. Open Questions

| # | Question | Owner | Resolution |
|---|----------|-------|------------|
| 1 | Should the prototyper introduce a shared `TopBar` component, or inject `<ThemeToggle />` into each page's existing header? | pipeline | Introduce a shared `TopBar` component that accepts `children` for page-specific actions and always renders `<ThemeToggle />`. Refactor each authenticated page and the login/register pages to use it. This reduces drift and makes future nav changes a single-file edit. |
| 2 | What exact Tailwind palette should dark mode use for backgrounds, cards, borders, and text? | pipeline | Backgrounds: `bg-slate-900` (page) / `bg-slate-800` (cards) / `bg-slate-700` (elevated surfaces). Borders: `border-slate-700`. Text: `text-slate-100` (primary) / `text-slate-300` (secondary) / `text-slate-400` (muted). Brand violets (`violet-500`/`violet-600`) remain the accent in both themes. |
| 3 | Does the login/register page need the toggle, given the user has no identity yet? | pipeline | Yes — the toggle is device-scoped and should be accessible before login. Place it in the same top-right position as on authenticated pages. |
| 4 | Is a flash of incorrect theme (FOIT) acceptable on first load? | pipeline | No — the pre-paint inline script in `index.html` is required (AC-12.1.4). FOIT is a visible bug, not a cosmetic edge case. |

---

## 7. Test Boundaries

- **External deps to mock:** `localStorage`, `window.matchMedia`, `window.addEventListener('storage', …)`.
- **Fixtures needed:**
  - A test renderer that wraps children in `<ThemeProvider>`.
  - Mock `matchMedia` returning `{ matches: true/false, addEventListener, removeEventListener }` to simulate OS preference.
  - A helper to dispatch synthetic `storage` events on `window`.
- **Integration vs. unit boundary:**
  - `ThemeContext.jsx` — unit tests: initial theme read from localStorage; falls back to OS when localStorage empty; `toggleTheme` flips value and writes localStorage; OS change updates theme only when localStorage empty; `storage` event from another tab updates theme within the listener tick.
  - `ThemeToggle.jsx` — component tests: renders moon icon in light mode and sun icon in dark mode; click calls `toggleTheme`; has accessible label (`aria-label="Toggle theme"`).
  - `TopBar.jsx` (if introduced) — component tests: renders `<ThemeToggle />`; renders children in the action slot.
  - Page smoke tests — for at least one representative page per route group (login, instructor dashboard, student dashboard, quiz study), assert that the rendered tree includes the toggle and the page's root element applies `dark:` classes. Do not snapshot every page.
- **Frontend test targets:**
  - `ThemeContext.test.jsx` — all state transitions above
  - `ThemeToggle.test.jsx` — icon selection, click handler, aria-label
  - `TopBar.test.jsx` — toggle presence, children slot
  - One integration test: render `<App />` with `aq_theme = 'dark'` in localStorage, assert `document.documentElement` has class `dark` after mount
- **Pre-paint script test:** Not testable in jsdom/happy-dom (runs before React mounts in the real browser). Skip with a comment referencing AC-12.1.4; verify manually in a real browser during code review.
- **Explicitly out of test scope:** Actual colour-contrast measurement (AC-12.1.7 is a design/review concern, not an automatable unit test in this stack), cross-browser visual regression, Tailwind build output.
- **Test quality standard:** Every test asserts a real, observable behaviour derived from an AC. Trivial assertions (`assert True`, empty test bodies, pass-only stubs) are never acceptable — if a behaviour cannot be tested in the current environment, skip it explicitly with a comment explaining why.

---

## 8. Handoff Checklist

- [x] All user stories have at least 2 acceptance criteria
- [x] Role/access table covers both instructor and student paths
- [x] Design decisions are filled in (especially persistence and LLM impact)
- [x] Out-of-scope list is non-empty
- [x] Open questions are resolved or explicitly marked pending
- [x] File saved as `specs/feat-012-theme-preferences.md`
