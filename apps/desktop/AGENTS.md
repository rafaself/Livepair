# apps/desktop AGENTS.md

## Scope
Electron desktop package boundary: privileged main/preload code, browser-only renderer code, and desktop-local shared types.

## Keep straight
- `src/main/` owns privileged Electron APIs, filesystem access, desktop capture, and IPC handlers.
- `src/preload/` exposes the minimal typed bridge into the renderer.
- `src/renderer/` stays browser-only and reaches desktop capabilities through `window.bridge` or small adapters.
- `src/shared/desktopBridge.ts` is the desktop IPC contract; move truly cross-package payloads to `@livepair/shared-types`.

## Look here first
- `src/shared/desktopBridge.ts`
- `src/main/ipc/registerIpcHandlers.ts`
- `src/main/ipc/validators.ts`

## Local guides
- `src/main/AGENTS.md`
- `src/preload/AGENTS.md`
- `src/renderer/AGENTS.md`

## Verification
- `pnpm verify:desktop`
