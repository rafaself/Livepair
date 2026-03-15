# apps/desktop/src/preload AGENTS.md

## Scope
Typed preload bridge between privileged desktop code and the browser-only renderer.

## Guardrails
- Keep preload thin: expose the minimal `contextBridge` surface and avoid business logic.
- `../shared/desktopBridge.ts` is the source of truth for bridge shape and channel names.
- New bridge methods should stay as simple `ipcRenderer.invoke` wrappers; validation belongs in main-process IPC validators.
- Do not expose raw Electron objects or broad pass-through helpers.

## Look here first
- `preload.ts`
- `../shared/desktopBridge.ts`
- `../main/ipc/registerIpcHandlers.ts`

## Verification
- Update `preload.test.ts` with bridge-surface changes, then use `pnpm verify:desktop` if needed.
