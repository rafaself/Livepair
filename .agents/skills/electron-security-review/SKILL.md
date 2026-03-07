---
name: electron-security-review
description: Security review checklist for changes touching Electron main process, preload scripts, IPC, permissions, screen capture, file system access, shell execution, or any privileged API surface.
---

# Electron Security Review

## Use when changes touch
- Main process code
- Preload scripts
- IPC handlers or channel definitions
- Permission requests or grants
- Screen capture or media access
- File system reads/writes from the app
- Shell or child process execution
- `webPreferences` or `BrowserWindow` configuration
- CSP headers or meta tags

## Sequencing
- **Phase:** post-implementation review — runs after code is written.
- If the change also touches shared contracts or the realtime path, run `contract-change-check` and/or `live-api-realtime-review` in parallel.
- If `feature-planner` was run, this skill should have been listed in its "Required downstream skills" output.

## Do not use when
- Changes are limited to renderer UI components with no IPC or privilege changes
- Changes are backend-only

## Checklist

1. **`contextIsolation`** - Confirm it remains `true` in all `BrowserWindow` configs.
2. **`nodeIntegration`** - Confirm it remains `false` in all `BrowserWindow` configs.
3. **Preload boundary** - Verify that only explicitly needed APIs are exposed via `contextBridge.exposeInMainWorld`. No blanket exposure of Node or Electron modules.
4. **Least-privilege IPC** - Each IPC channel exposes only the minimum needed operation. No generic "execute" or "eval" channels.
5. **Input validation** - All arguments received via IPC in the main process are validated before use.
6. **Renderer safety** - Renderer code does not access `require`, `process`, `electron`, or Node APIs directly.
7. **Dangerous patterns** - Check for:
   - `shell.openExternal` with unvalidated URLs
   - `protocol.registerFileProtocol` without path validation
   - Dynamic `require` or `import` based on user input
   - `webSecurity: false`
   - `allowRunningInsecureContent: true`
   - Missing or overly permissive CSP
8. **API key exposure** - No permanent API keys or secrets in client-shipped code. Ephemeral tokens only.

## Output format

```
## Electron Security Review

**Findings:**
- [CRITICAL/HIGH/MEDIUM/LOW] <finding>

**Required fixes:**
- <fix>

**Optional improvements:**
- <improvement>

**Verdict:** PASS / FAIL (with required fixes)
```

If no findings: state "No security issues found" and verdict PASS.
