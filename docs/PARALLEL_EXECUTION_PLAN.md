# Parallel Execution Plan (Two Lanes + Two Worktrees)

**Last updated:** 2026-03-11

> **Status:** Planning artifact. This document captures the parallel execution strategy and file-boundary guidance for multi-lane development. The recorded baseline (S1 and S4 locks) reflects the current repository state. The lane and worktree guidance remains active contributor guidance.

This document is the single source of truth for the parallel execution phase using **two concurrent git worktrees**.

## 1) Current state (recorded)

- **S1 complete:** Mode exclusivity lock is in place (no overlapping product-level mode transitions).
- **S4 complete:** Speech-mode lifecycle lock is in place (no overlapping speech lifecycle transitions).
- **Product mode source of truth:** `currentMode` (see `apps/desktop/src/renderer/store/sessionStore.ts`).
- **Product speech-state source of truth:** `speechLifecycle` (see `apps/desktop/src/renderer/store/sessionStore.ts`).

## 2) Critical flows to preserve

These are the “must not regress” behaviors while working in parallel:

- **Text mode send/receive:** typed message send, streamed/received assistant response rendering, and transcript updates.
- **Speech mode enter/exit:** explicit user entry/exit from speech mode; UI reflects lifecycle transitions.
- **Auto-start microphone on entering speech mode:** entering speech mode starts capture without extra clicks.
- **Interruption / playback stop behavior:** user interrupt stops assistant playback quickly and returns to listening/recovering as designed.
- **Typed input during speech mode:** typing remains usable (and does not break voice lifecycle).
- **Manual-only screen capture:** screen capture happens only when explicitly invoked (no automatic capture).
- **Resume behavior (implemented):** on “go-away” / termination, the runtime attempts resumption using the latest resumption handle; if the auth token is near expiry it refreshes before resuming; explicit failure paths drop back to safe “off/text” states (see tests under `apps/desktop/src/renderer/runtime/sessionController.resumption.test.ts`).

## 3) Two future lanes

The goal is to keep day-to-day work parallel with minimal overlap.

### Lane A — UX / interaction surface

Owns user-facing interaction, presentation, and non-runtime UI composition.

Examples: layout, affordances, accessibility, copy, onboarding, debug panel UX, component tests.

### Lane B — runtime / infra hardening

Owns correctness, resiliency, performance, and boundary validation across runtime/control-plane surfaces.

Examples: session controller lifecycle, transport adapters, token refresh/resumption, interruption correctness, error handling, targeted runtime tests.

## 4) File-boundary guidance (minimize merge conflicts)

Default ownership boundaries:

- **Lane A edits (preferred):**
  - `apps/desktop/src/renderer/components/**`
  - `apps/desktop/src/renderer/styles/**` (if present)
  - `apps/desktop/src/renderer/components/**/*.test.tsx`
- **Lane B edits (preferred):**
  - `apps/desktop/src/renderer/runtime/**`
  - `apps/backend/**` (control-plane)
  - `apps/desktop/src/renderer/runtime/**/*.test.ts`
- **Shared contracts / shared types (special-case):**
  - `packages/shared-types/**` changes should be done in a dedicated, short-lived branch to avoid cross-lane conflicts; update all consumers in the same PR.

Avoid parallel edits to these high-conflict files unless explicitly coordinated:

- `apps/desktop/src/renderer/store/sessionStore.ts`
- `apps/desktop/src/renderer/App.tsx`
- Cross-cutting “controller ↔ store ↔ UI” glue modules

Rule of thumb:

- If a change needs touching both UI and runtime, **split it**: Lane B exposes a small, typed surface first; Lane A consumes it in a follow-up PR.

## 5) Git worktree / branch workflow (recommended)

Principles:

- **One branch per task**, **one worktree per branch**.
- **Merge quickly** (small PRs).
- **Remove the worktree after merge**.
- **Recreate from updated `main`** for the next task.

Suggested commands (example):

```bash
# Start from an up-to-date main
git switch main
git pull --ff-only

# Lane A task branch + worktree
git worktree add ../livepair-wt-a -b task/<short-name>-a main

# Lane B task branch + worktree
git worktree add ../livepair-wt-b -b task/<short-name>-b main
```

After merge (per lane/task):

```bash
git worktree remove ../livepair-wt-a
git branch -d task/<short-name>-a
```

Then recreate the worktree from the updated `main` for the next task.

## 6) Recommended execution waves

Sequence work to keep lanes mostly disjoint, and postpone cross-cutting refactors:

1. **Wave 1 (disjoint edits):** Lane A ships UI-only improvements/tests; Lane B ships runtime-only hardening/tests with no UI churn.
2. **Wave 2 (bounded interfaces):** Lane B lands small, typed runtime surfaces; Lane A consumes them later without changing runtime internals.
3. **Wave 3 (contract/shared-type changes):** do as a dedicated PR (temporarily “single-lane”) to keep `packages/shared-types/**` conflicts low.
4. **Wave 4 (high-conflict files):** only after earlier waves are merged; schedule short tasks and merge immediately.

