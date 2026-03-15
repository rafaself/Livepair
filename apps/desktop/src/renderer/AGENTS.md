# apps/desktop/src/renderer AGENTS.md

## Scope
Browser-only desktop frontend: UI, stores, hooks, chat-memory composition, and session/runtime wiring.

## Guardrails
- No direct `electron`, Node, or filesystem imports in this subtree.
- Route privileged access through `window.bridge` or small adapter modules at the edges.
- Keep product-level mode semantics aligned: user-facing modes are `text` and `speech`; runtime-only `voice` naming stays internal to the Live session path.
- `components/AGENTS.md` owns UI-layer rules; `runtime/AGENTS.md` owns realtime hot-path rules.

## Look here first
- `bootstrap.ts`
- `store/`
- `runtime/`
- `components/`

## Verification
- Start with focused renderer or runtime tests, then widen to `pnpm verify:desktop` when the change spans layers.
