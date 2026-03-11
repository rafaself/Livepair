# apps/desktop AGENTS.md

## Purpose
Electron main + preload + React renderer. The renderer connects directly to Gemini Live; the backend is control-plane only (health/settings/token requests).

## Security — Non-Negotiable
- `contextIsolation: true` and `nodeIntegration: false` must never be changed (see `src/main/window/overlayWindow.ts`).
- All privileged access goes through `src/preload/preload.ts` and a typed `window.bridge`.
- The renderer (`src/renderer/`) must never import Electron or Node built-ins.
- Keep the renderer CSP in `src/renderer/index.html`.

## IPC Discipline
- Single source of truth for IPC contracts: `src/shared/desktopBridge.ts` (`DesktopBridge` + `IPC_CHANNELS`).
- IPC handlers are registered in `src/main/ipc/registerIpcHandlers.ts` (called from `src/main/main.ts`).
- Validate IPC payloads in `src/main/ipc/validators.ts` before doing work.
- Channel names follow `domain:action` (see `IPC_CHANNELS`).
- Do not expose generic pass-through IPC or eval-style channels.

## Renderer Rules
- Only `window.bridge` — never `window.electron`, `window.ipcRenderer`, or raw Electron APIs.
- Keep UI lightweight. Do not add heavy dependencies to the renderer.
- State stays local to the component unless a shared store is clearly justified.

## Design System
- Prefer CSS custom properties from `src/renderer/styles/tokens.css` and `src/renderer/styles/motion.css` (especially for colors, spacing, radius, shadows, motion).
- The style entry point is `src/renderer/styles/index.css` — imported once in `main.tsx`. Do not add additional global CSS imports.
- Component CSS lives under `src/renderer/components/` and is imported by the relevant component(s). Avoid new global `components.css`.
- See `src/renderer/components/AGENTS.md` for component architecture rules.

## Testing
- TDD for IPC handler logic when practical.
- Renderer component tests are optional for the MVP; add them when testing UI state machines.

## Verification
- Prefer `pnpm verify:desktop` after changes (lint + typecheck + test).
