# AutoQuiz — Feature Backlog

> **Purpose:** Canonical list of features to be built, each with status, user stories,
> and a pointer to its detailed spec file. The orchestrator reads this to know what is
> queued and in what order. Agents never modify this file — only the product owner does.
>
> **Status values:** `backlog` | `ready` | `in-progress` | `in-review` | `done`
> **Priority values:** `P0` (must-have) | `P1` (high) | `P2` (nice-to-have)

---

## How agents use this file

- **Orchestrator:** reads the `ready` features in priority order; picks the next one to run
- **Req-validator:** uses the Stories and ACs here as the ground truth for PASS/FAIL verdicts
- **Design-validator:** uses the Dependencies column to check that prerequisite features are stable
- **Prototyper / Tester:** do not read this file directly; they receive the relevant feature's spec file

---

## Feature Index

| ID | Feature | Priority | Status | Spec file | Depends on |
|----|---------|----------|--------|-----------|------------|
| FEAT-001 | Authentication & Session Management | P0 | ready | `specs/feat-001-auth-session.md` | — |
| FEAT-002 | Class Management (Instructor) | P0 | ready | `specs/feat-002-class-management.md` | FEAT-001 |

> Add rows here as features are identified. Move status to `ready` only after the spec
> file is complete and the handoff checklist in that file is checked off.

---

## Feature Details

### FEAT-002 — Class Management (Instructor)

**Stories:** 2.1 Create a class, 2.2 View class list, 2.3 View class detail
**ACs summary:** Create form disabled when name empty; inserts into `classes` with 6-char unique `class_code`; new class prepends to list without reload; form resets; dashboard fetches only instructor's own classes with member counts ordered newest-first; detail page shows name/code/description/members with clipboard copy.
**Dependencies:** FEAT-001
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

### FEAT-001 — Authentication & Session Management

**Stories:** 1.1 Registration, 1.2 Login, 1.3 Session persistence, 1.4 Logout, 1.5 Role-based access control
**ACs summary:** Registration inserts into `profiles` and redirects by role; login checks credentials and redirects; session restored from `aq_profile` in localStorage; logout clears session and blocks protected routes; `ProtectedRoute` enforces role and auth state.
**Dependencies:** none
**Implementation status:** already in codebase — pipeline run is for validation and test coverage catch-up.

---

## Conventions for writing new entries

1. **ID:** sequential `FEAT-NNN`
2. **Stories:** `As a [instructor|student], I want [action], so that [outcome]`
3. **ACs in this file:** brief summaries only — full verifiable ACs live in the spec file
4. **Dependencies:** list feature IDs that must be `done` before this one starts
5. **Spec file:** create the file (from `specs/_TEMPLATE.md`) before setting status to `ready`
