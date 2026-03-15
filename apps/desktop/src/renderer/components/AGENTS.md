# apps/desktop/src/renderer/components AGENTS.md

## Scope
Renderer component layers: `primitives`, `layout`, `composite`, and `features`.

## Local rules
- Keep imports flowing upward only: `primitives` -> none, `layout` -> `primitives`, `composite` -> `layout`/`primitives`, `features` -> any lower layer.
- Keep `primitives/` and `layout/` free of API calls, IPC, timers, and other side effects.
- Export a named `ComponentNameProps` type for exported components.
- Co-locate component styles; leave shared/global styling to `../styles/`.
- Maintain barrel exports for each layer and the top-level `components/index.ts`.

## Verification
- Prefer focused component tests; use `pnpm verify:desktop` for package-level confirmation.
