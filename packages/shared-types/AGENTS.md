# packages/shared-types AGENTS.md

## Purpose
Canonical cross-package contracts (API payloads, IPC shapes, runtime events).

## Rules
- Keep this package **types-first**: prefer TypeScript types/interfaces and small serializable constants.
- Do not import platform-specific modules (Electron/Node/DOM) into shared types.
- Favor backwards-compatible changes (additive fields/types). If you must break compatibility, update all consumers in the same task.

## Tests + Verification
- Add/update type-level assertions in `src/index.type-test.ts` when changing contracts.
- Prefer `pnpm verify:shared-types` after changes.
