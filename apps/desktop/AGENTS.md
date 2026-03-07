# apps/desktop AGENTS.md

## Purpose
Electron + React desktop app. Captures audio/screen, connects directly to Gemini Live API using ephemeral tokens from the backend.

## Security — Non-Negotiable
- `contextIsolation: true` and `nodeIntegration: false` must never be changed.
- All privileged access (IPC, file system, native APIs) goes through `src/preload/preload.ts` only.
- The renderer (`src/renderer/`) must never import Electron or Node APIs directly.
- Add only minimal, typed entries to `contextBridge.exposeInMainWorld`.
- CSP must remain in `index.html`.

## IPC Discipline
- Every IPC channel must be declared in the preload bridge interface (`DesktopBridge`).
- IPC handlers live in `src/main/main.ts` (or sub-modules imported from main).
- Channel names follow `domain:action` (e.g. `health:check`, `session:requestToken`).
- Do not expose generic pass-through IPC or eval-style channels.

## Renderer Rules
- Only `window.bridge` — never `window.electron`, `window.ipcRenderer`, or raw Electron APIs.
- Keep UI lightweight. Do not add heavy dependencies to the renderer.
- State stays local to the component unless a shared store is clearly justified.

## Design System
- All visual values (colors, spacing, radius, shadow, z-index, motion) come from CSS custom properties defined in `src/renderer/styles/tokens.css` and `src/renderer/styles/motion.css`. Never hardcode these values in component CSS or inline styles.
- The style entry point is `src/renderer/styles/index.css` — imported once in `main.tsx`. Do not add additional global CSS imports.
- Component CSS lives co-located with its `.tsx` file and is imported directly in that file. No global `components.css`.
- See `src/renderer/components/AGENTS.md` for component architecture rules.

## Shared Contracts
- Import types from `@livepair/shared-types` — never redefine API shapes locally.
- Any new IPC channel must update `DesktopBridge` in preload and the type declaration in App or a dedicated types file.

## Testing
- TDD for IPC handler logic when practical.
- Renderer component tests are optional for the MVP; add them when testing UI state machines.

## Change Discipline
- Run `typecheck` after every change.
- Run `build` before declaring a feature complete.
- Do not add Gemini or audio/video pipeline code until the relevant task is scoped.
