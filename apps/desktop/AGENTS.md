# apps/desktop AGENTS.md

## Purpose
Electron desktop app boundary for `src/main/`, `src/preload/`, `src/renderer/`, and desktop-local shared code.

## What belongs here
- Windowing, IPC, preload bridge, renderer UI/runtime, desktop settings, and desktop-only shared contracts.
- Desktop-local bridge types in `src/shared/`; true cross-package payloads still belong in `packages/shared-types`.

## What must not go here
- Duplicated request, response, or event shapes that already belong in `@livepair/shared-types`.
- Raw Electron or Node imports anywhere under `src/renderer/`.
- Generic pass-through IPC or privileged APIs exposed outside `window.bridge`.

## Local conventions
- `src/main/` owns privileged work, `src/preload/` exposes the minimal typed bridge, and `src/renderer/` stays browser-only.
- Keep `contextIsolation: true`, `nodeIntegration: false`, and the renderer CSP intact.
- IPC source of truth is `src/shared/desktopBridge.ts`; register handlers in `src/main/ipc/registerIpcHandlers.ts`; validate payloads in `src/main/ipc/validators.ts`.
- Renderer code uses `window.bridge` or small adapter modules only; never import Electron directly.
- Keep global renderer styles in `src/renderer/styles/index.css`; co-locate component CSS under `src/renderer/components/`.

## Verification
- Prefer `pnpm verify:desktop` after code changes in this package.
