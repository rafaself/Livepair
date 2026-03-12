---
name: contract-change-check
description: Verifies that Livepair contract changes are centralized, propagated to all consumers, and reflected in shared types, IPC surfaces, DTOs, and validators. Use when changing shared-types, DesktopBridge, IPC channels, backend DTOs, or any session or settings payload that crosses renderer, main, or backend boundaries.
---

# Contract Change Check

## Use when changes affect
- `packages/shared-types/src/index.ts`
- desktop IPC channels or `DesktopBridge`
- backend request/response payloads or DTOs
- shared validation logic used across package boundaries
- session or settings payloads that cross renderer/main/backend boundaries

## Do not use when
- The change is internal to one module with no shared callers
- The changed type is not consumed outside its local file/package

## Workflow

1. Identify the canonical contract definition. In this repo that is usually:
   - `packages/shared-types/src/index.ts`
   - `apps/desktop/src/shared/desktopBridge.ts`
   - a backend DTO paired with shared types under `apps/api/src/**/dto`
2. Search consumers with `rg` before concluding the update is complete.
3. Confirm every consumer was updated in the same task:
   - renderer callers using `window.bridge`
   - preload bridge exposure in `apps/desktop/src/preload/preload.ts`
   - main IPC handlers in `apps/desktop/src/main/ipc/registerIpcHandlers.ts`
   - desktop validators in `apps/desktop/src/main/ipc/validators.ts`
   - backend controller/service/DTO files under `apps/api/src`
4. Check for duplicate shapes. If a payload changed, it should not also live as an untracked local interface elsewhere.
5. Check runtime validation:
   - backend DTO decorators
   - desktop IPC validators
   - any manual guards or normalizers
6. Note compatibility and rollout risk:
   - desktop and backend may evolve independently
   - breaking payload changes require an explicit rollout note
7. If the task mentions realtime events, confirm whether those events exist in current code. If they do not, say that the contract is still planned and cannot be verified from implementation.

## Output format

```md
## Contract Change Check

**Canonical contracts changed:**
- <path> — <what changed>

**Consumers checked:**
- <path> — <updated / unaffected / missing update>

**Validation alignment:**
- <validator or DTO> — <status>

**Compatibility and rollout:**
- <compatible / breaking> — <notes>

**Missing updates:**
- <item or "None">

**Cannot verify from current context:**
- <item or "None">
```
