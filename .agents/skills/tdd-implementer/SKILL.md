---
name: tdd-implementer
description: Applies TDD in Livepair by writing the smallest failing test first, implementing the minimum change to pass, and verifying with the narrowest pnpm command. Use when changing backend services, validators, controllers, IPC handlers, stores, hooks, shared contracts, or any logic with meaningful test value.
---

# TDD Implementer

## Use when
- Changing backend services, DTO validation, controllers, or env/config behavior
- Changing desktop main/preload/shared logic, IPC validation, stores, hooks, or typed adapters
- Changing shared contracts or shared utility logic

## Do not use when
- The change is documentation-only or skill-only
- The change is trivial wiring with no meaningful test value
- The task is a spike, but add regression coverage before closing if behavior changed

## Repository test map

- `apps/api`: Jest + `@nestjs/testing` + `supertest` when useful
- `apps/desktop`: Vitest + Testing Library + `src/renderer/test/setup.ts`
- `packages/shared-utils`: Vitest in node mode
- `packages/shared-types`: compile-only type assertions via `pnpm --filter @livepair/shared-types test`

## Workflow

1. Pick the smallest test level that covers the change:
   - shared contract shape -> type test or consumer regression
   - validator/parser/store/service logic -> unit test
   - controller + DTO boundary -> Nest testing or lightweight integration
   - renderer state/UI logic -> targeted Vitest test
2. Write or update the failing test first near the changed code.
3. Run the narrowest command that proves failure.
4. Implement the minimum change to pass.
5. Re-run the same narrow command.
6. Refactor only if behavior stays covered.
7. Before closing, widen verification to the smallest relevant package command:
   - `pnpm --filter @livepair/<pkg> test`
   - optionally `pnpm verify:<pkg>` when lint/typecheck coverage matters for that package

## Repository checks

- Do not weaken Electron security just to make tests easier.
- Prefer shared contract imports over duplicated local test shapes.
- When testing desktop renderer code, use the existing bridge/store setup instead of ad hoc globals.
- When TDD is skipped, say why and state what regression coverage was added instead.

## Output format

```md
## TDD Summary

**Failing test first:**
- <file> — <what failed initially>

**Implementation:**
- <minimum code change>

**Verification run:**
- <command> — <result>

**Coverage notes:**
- <what behavior is now protected>

**Cannot verify from current context:**
- <item or "None">
```
