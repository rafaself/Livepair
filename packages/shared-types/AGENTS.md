# packages/shared-types AGENTS.md

## Scope
Canonical cross-package contract package.

## Guardrails
- Keep exports serializable, platform-neutral, and free of side effects.
- Do not add Electron, Node, DOM, or package-local business logic here.
- Prefer additive contract changes and update every consumer in the same task.
- Keep package-root exports authoritative; consumers should import from `@livepair/shared-types`.
- Update `src/index.type-test.ts` when the public surface changes.

## Verification
- `pnpm verify:shared-types`
