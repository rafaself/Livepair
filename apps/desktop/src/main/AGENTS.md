# apps/desktop/src/main AGENTS.md

## Scope
Privileged Electron main-process code.

## Owns
- BrowserWindow creation and app lifecycle
- IPC handler registration, filesystem access, desktop capture, and local desktop settings persistence

## Guardrails
- Keep BrowserWindow security defaults intact: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- Any new renderer-facing capability must be added in `../shared/desktopBridge.ts`, implemented here, and validated in `ipc/validators.ts` before exposure.
- Keep handlers thin; push reusable work into local services/modules.
- Do not move Gemini Live audio or video transport into main.
- Do not reintroduce desktop-local durable chat-memory persistence; preserve the bridge contract and keep chat-memory ownership on backend APIs.

## Look here first
- `window/overlayWindow.ts`
- `ipc/registerIpcHandlers.ts`
- `ipc/validators.ts`

## Verification
- Start with focused `src/main` tests, then use `pnpm verify:desktop` when the change crosses the package.
