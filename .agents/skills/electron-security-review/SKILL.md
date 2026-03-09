---
name: electron-security-review
description: Review Livepair Electron security boundaries with concrete checks against the real main, preload, renderer, IPC, CSP, and validator files.
---

# Electron Security Review

## Use when changes touch
- `apps/desktop/src/main/**`
- `apps/desktop/src/preload/**`
- `apps/desktop/src/shared/desktopBridge.ts`
- IPC validators or channel definitions
- renderer code that consumes privileged APIs
- BrowserWindow configuration, permissions, CSP, file system, shell, or native access

## Do not use when
- The change is backend-only
- The change is renderer-only styling or presentational UI with no bridge or privilege impact

## Inspection steps

1. Inspect `apps/desktop/src/main/window/overlayWindow.ts`:
   - `contextIsolation: true`
   - `nodeIntegration: false`
   - `sandbox: true`
   - no unsafe web preferences
2. Inspect `apps/desktop/src/preload/preload.ts` and `apps/desktop/src/shared/desktopBridge.ts`:
   - only narrow, typed APIs exposed through `contextBridge`
   - no raw `ipcRenderer`, `electron`, or Node surface leaked to renderer
3. Inspect `apps/desktop/src/main/ipc/registerIpcHandlers.ts` and `apps/desktop/src/main/ipc/validators.ts`:
   - inputs validated before use
   - no generic pass-through, eval-style, or shell-style channels
   - overlay and settings mutations remain constrained
4. Inspect renderer entry points such as `apps/desktop/src/renderer/index.html` and changed renderer files:
   - CSP still present
   - renderer does not import Electron or Node directly
5. Search for dangerous patterns in changed files and nearby code:
   - `shell.openExternal`
   - `webSecurity: false`
   - `allowRunningInsecureContent: true`
   - `nodeIntegration: true`
   - `contextIsolation: false`
   - dynamic `require` / `import` from user input
6. Check secret handling:
   - no permanent Gemini key shipped to the client
   - token flow still uses backend-issued ephemeral credentials
7. If a claim cannot be proven from the changed code or current repository state, say so explicitly.

## Output format

```md
## Electron Security Review

**Findings:**
- [severity] <finding> — <path>

**Required fixes:**
- <fix or "None">

**Verified invariants:**
- <invariant>

**Cannot verify from current context:**
- <item or "None">

**Verdict:** PASS / FAIL
```

If there are no findings, still list the invariants that were actually checked.
