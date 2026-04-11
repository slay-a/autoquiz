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

> Add rows here as features are identified. Move status to `ready` only after the spec
> file is complete and the handoff checklist in that file is checked off.

---

## Feature Details

> Feature detail entries will appear here as features are added to the index above.

---

## Conventions for writing new entries

1. **ID:** sequential `FEAT-NNN`
2. **Stories:** `As a [instructor|student], I want [action], so that [outcome]`
3. **ACs in this file:** brief summaries only — full verifiable ACs live in the spec file
4. **Dependencies:** list feature IDs that must be `done` before this one starts
5. **Spec file:** create the file (from `specs/_TEMPLATE.md`) before setting status to `ready`
