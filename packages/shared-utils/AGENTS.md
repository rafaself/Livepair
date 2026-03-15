# packages/shared-utils AGENTS.md

## Scope
Small cross-package utility functions.

## Guardrails
- Keep utilities pure, dependency-light, and platform-neutral.
- Only promote helpers here when they are reused across packages; keep app- or domain-specific logic local.
- Avoid side effects, environment reads, and package-specific imports.
- Keep the public surface exported from `src/index.ts`.

## Verification
- `pnpm verify:shared-utils`
