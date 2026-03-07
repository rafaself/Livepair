---
name: contract-change-check
description: Verifies that changes to shared contracts (API payloads, IPC messages, event schemas, shared types) are complete, consistent, and update all impacted consumers in the same task.
---

# Contract Change Check

## Use when changes affect
- API request/response payloads between desktop and backend
- IPC message definitions or channel contracts
- Shared TypeScript types used across packages
- Realtime event structures (WebSocket messages, streaming events)
- Shared validation schemas or Zod/Joi definitions

## Sequencing
- **Phase:** post-implementation verification — runs after code is written.
- Not a substitute for `feature-planner`. If the task is non-trivial, run `feature-planner` first to plan the change, then run this skill to verify contract completeness after implementation.
- Can run in parallel with `electron-security-review` and `live-api-realtime-review`.

## Do not use when
- Changes are internal to a single package with no shared surface
- The modified types are not imported by any other package

## Checklist

1. **Shared types updated** - The canonical type definition is updated in the shared location. Not patched locally in a consumer.
2. **No duplicated schemas** - The same contract is not defined in multiple places. If it is, consolidate.
3. **All consumers identified** - List every file/module that imports or depends on the changed contract.
4. **Consumers updated** - Every identified consumer handles the new shape. No consumer left using the old contract.
5. **Backward-compatibility risk** - If the backend and desktop can be deployed independently, note whether the change is backward-compatible. If breaking, note the required deployment order.
6. **Validation updated** - If the contract has runtime validation (Zod, Joi, manual checks), the validation matches the new shape.

## Output format

```
## Contract Change Check

**Changed contracts:**
- <type/schema name> in <file path> — <what changed>

**Impacted consumers:**
- <file path> — <status: updated / needs update>

**Missing updates:**
- <item or "None">

**Backward-compatibility:**
- <compatible / breaking — deployment notes>

**Follow-up items:**
- <item or "None">
```
