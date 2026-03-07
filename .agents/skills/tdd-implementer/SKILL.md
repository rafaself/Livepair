---
name: tdd-implementer
description: Enforces test-driven development workflow. Write a failing test first, implement the minimum change to pass, then refactor. Applies to all non-trivial logic changes.
---

# TDD Implementer

## Use when
- Implementing new domain logic, reducers, parsers, or services
- Fixing a bug with a reproducible root cause
- Changing shared contracts or validation logic
- Adding or modifying backend endpoints

## Do not use when
- Running a spike or throwaway experiment (but still require regression coverage before closing)
- Writing glue code with poor test value (e.g., wiring a config constant)
- The change is purely declarative (CSS, static markup)

## Sequencing
- **Phase:** implementation — runs during coding, after `feature-planner` (if used).
- If `feature-planner` was run, follow the test plan from its output.
- This skill does not replace post-implementation reviews (`electron-security-review`, `live-api-realtime-review`, `contract-change-check`).

## Workflow

1. **Write a failing test** - Define the expected behavior. Run the test and confirm it fails for the right reason.
2. **Implement the minimum change** - Write only enough code to make the test pass. Do not add unrelated functionality.
3. **Run the test** - Confirm it passes.
4. **Refactor** - Clean up the implementation without changing behavior. Re-run tests after refactoring.
5. **Repeat** - If the feature requires more behavior, go back to step 1.

### Bug fix variant
1. **Reproduce with a test** - Write a test that fails due to the bug.
2. **Fix** - Apply the minimum fix.
3. **Confirm** - Test passes, no regressions.

### When TDD is skipped
- Still require at least one regression test covering the new behavior before marking the task complete.
- Document why TDD was skipped (spike, glue code, etc.).

## Output format

```
## TDD Summary

**Tests added/updated:**
- <test file>:<test name> — <what it covers>

**Implementation:**
- <short description of what changed>

**Remaining risks:**
- <risk or "None">
```
