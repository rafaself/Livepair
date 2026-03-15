# apps/desktop/src/main AGENTS.md

## Scope
Privileged Electron main-process code.

## Owns
- BrowserWindow creation and app lifecycle
- IPC handler registration, filesystem access, desktop capture, and local persistence services

## Guardrails
- Keep BrowserWindow security defaults intact: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Any new renderer-facing capability must be added in `../shared/desktopBridge.ts`, implemented here, and validated in `ipc/validators.ts` before exposure.
- Keep handlers thin; push reusable work into local services/modules.
- Do not move Gemini Live audio or video transport into main.
- Treat desktop-local chat-memory persistence as transitional; preserve the bridge contract, but move durable chat-memory ownership toward backend APIs instead of growing new main-process storage.

## Look here first
- `window/overlayWindow.ts`
- `ipc/registerIpcHandlers.ts`
- `ipc/validators.ts`

## Verification
- Start with focused `src/main` tests, then use `pnpm verify:desktop` when the change crosses the package.
