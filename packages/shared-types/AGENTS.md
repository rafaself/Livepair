# packages/shared-types AGENTS.md

## Purpose
Canonical shared contract package for cross-package payloads, shared records, and other serializable types.

## What belongs here
- Types, interfaces, and small constants consumed across package boundaries.
- Contract changes that stay serializable and platform-neutral.

## What must not go here
- Electron, Node, DOM, or other platform-specific APIs.
- Business logic, side effects, or package-local helpers.
- Desktop-only bridge definitions; those stay in `apps/desktop/src/shared/`.

## Local conventions
- Keep the package types-first and free of platform-specific imports.
- Prefer additive changes; if a contract changes, update all consumers in the same task.
- Keep package-root exports authoritative; consumers should import from `@livepair/shared-types`.
- Update `src/index.type-test.ts` when the public contract surface changes.

## Verification
- Prefer `pnpm verify:shared-types` after code changes in this package.
