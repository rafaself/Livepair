# apps/desktop/src/renderer/components AGENTS.md

## Purpose
Renderer component architecture for the `primitives`, `layout`, `composite`, and `features` layers.

## What belongs here
- Component layering, prop/export conventions, and CSS/file organization for this subtree.

## What must not go here
- Runtime or session-orchestration rules; those live in `../runtime/AGENTS.md`.
- Raw Electron or Node access.
- Side effects in low-level UI layers.

## Local conventions
- Import direction is one-way: `primitives` imports no higher layer; `layout` may import `primitives`; `composite` may import `layout` and `primitives`; `features` may import any lower layer.
- Keep `primitives/` and `layout/` free of API calls, IPC, timers, and other side effects.
- Export a named `ComponentNameProps` for exported components.
- Keep component styles co-located; leave global styling to `src/renderer/styles/`.
- Maintain barrel exports via each layer `index.ts` and the top-level `components/index.ts`.

## Verification
- Prefer targeted renderer tests when component behavior changes; use `pnpm verify:desktop` for package-level confirmation.
