---
name: feature-planner
description: Plans non-trivial Livepair changes before coding by anchoring to the real repository layout, current implementation status, boundary impact, and required downstream reviews. Use when a task touches more than one file or package boundary, modifies API payloads, IPC channels, settings, or session behavior, or when implementing features described in docs that may not yet exist in code.
---

# Feature Planner

## Use when
- The task touches more than one file, package, or runtime boundary
- The change adds or modifies API payloads, IPC channels, settings flows, or session behavior
- The task implements something described in docs but not obviously present in code today

## Do not use when
- The change is an isolated single-file fix with an obvious implementation path
- The work is purely presentational or documentation-only

## Workflow

1. Inspect the current implementation before planning. Use the smallest relevant reads under:
   - `apps/desktop/src/main`, `apps/desktop/src/preload`, `apps/desktop/src/renderer`
   - `apps/api/src`
   - `packages/shared-types/src`
   - `README.md`, `docs/ARCHITECTURE.md`, `WATCHOUTS.md`
2. Separate `implemented today` from `planned target`. Do not plan against docs-only architecture without naming the missing code.
3. List the exact files or modules expected to change. Include new files if any.
4. Identify boundary impact:
   - renderer vs preload vs main
   - desktop vs backend
   - shared contract vs local implementation
   - realtime hot path vs control plane
5. Identify contract impact. Check whether the task changes:
   - `packages/shared-types/src/index.ts`
   - `apps/desktop/src/shared/desktopBridge.ts`
   - backend DTOs under `apps/api/src/**/dto`
   - runtime validators such as `apps/desktop/src/main/ipc/validators.ts`
6. Call out security, latency, and scope risks specific to this repo:
   - Electron security invariants
   - backend must not proxy audio/video
   - controllers stay thin
   - no new production dependency without user confirmation
7. Define the smallest relevant tests and verification commands first:
   - `pnpm --filter @livepair/api test`
   - `pnpm --filter @livepair/desktop test`
   - `pnpm --filter @livepair/shared-types test`
   - widen to `verify:<pkg>` only when the task warrants it
8. Declare downstream skills:
   - contract changed -> `contract-change-check`
   - main/preload/IPC/security surface touched -> `electron-security-review`
   - realtime/session/control-plane boundary touched -> `live-api-realtime-review`
   - responsibility placement changed across desktop/backend/shared -> `architecture-boundary-review`
   - logic change with meaningful test value -> `tdd-implementer`
9. State what cannot be verified from current context.

## Output format

```md
## Feature Plan: <task>

**Goal:** <one sentence>

**Implemented today vs planned target:**
- Implemented: <relevant current code>
- Planned/not yet in code: <target-state items or "None">

**Files/modules expected to change:**
- <path> — <reason>

**Boundary impact:**
- <boundary> — <effect or "None">

**Contracts affected:**
- <contract/path> — <change or "None">

**Key risks:**
- <risk>

**Tests and verification:**
- <test file or command>

**Minimal implementation path:**
1. <step>

**Out of scope:**
- <item>

**Required downstream skills:**
- <skill>

**Cannot verify from current context:**
- <item or "None">
```

Keep it short and repository-specific. If the plan starts describing speculative subsystems, tighten scope.
