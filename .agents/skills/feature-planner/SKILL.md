---
name: feature-planner
description: Structured planning workflow for non-trivial features. Produces a short plan covering goal, affected files, contracts, risks, tests, and minimal implementation path before any code is written.
---

# Feature Planner

## Use when
- Implementing a feature that touches more than one file or module
- Adding a new capability that affects shared contracts, IPC, or API surface
- The implementation path is not immediately obvious

## Do not use when
- The change is a single-file bug fix with a clear root cause
- The task is a spike or throwaway experiment
- The change is purely cosmetic (formatting, renaming)

## Sequencing
- **Phase:** planning — runs before any code is written.
- This skill runs first. Its output determines which downstream skills apply.
- Do not use `contract-change-check`, `electron-security-review`, or `live-api-realtime-review` as substitutes for this skill. Those are post-implementation verification.

## Workflow

1. **State the goal** - One sentence describing what the feature does and why it matters.
2. **List affected files/modules** - Identify every file or module that will be created, modified, or deleted.
3. **Identify shared contracts affected** - List any API payloads, IPC messages, shared types, or event schemas that change. If none, state "None."
4. **List risks** - What could break, regress, or conflict. Include security, latency, and backward-compatibility risks.
5. **Define tests to add or update** - Specify failing tests to write first (per TDD preference). Include unit, integration, and E2E as applicable.
6. **Describe the minimal implementation path** - Ordered steps to implement. Each step should be small enough to verify independently.
7. **Mark out-of-scope items** - Explicitly list related work that will NOT be done in this task.
8. **Declare required downstream skills** - Based on the plan, list which skills must run after implementation:
   - Shared contracts affected → `contract-change-check`
   - Electron main/preload/IPC touched → `electron-security-review`
   - Realtime path touched → `live-api-realtime-review`
   - Always include `tdd-implementer` unless TDD is explicitly skipped.

## Output format

```
## Feature Plan: <feature name>

**Goal:** <one sentence>

**Affected files/modules:**
- <path> — <what changes>

**Shared contracts affected:**
- <contract> — <change description>

**Risks:**
- <risk>

**Tests:**
- <test to add/update>

**Implementation steps:**
1. <step>

**Out of scope:**
- <item>

**Required downstream skills:**
- <skill name>
```

Keep the plan under 40 lines. If it exceeds that, the feature scope is likely too large — split it.
