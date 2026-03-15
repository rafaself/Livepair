# apps/desktop/src/renderer/runtime AGENTS.md

## Scope
Renderer session runtime for Gemini Live transport, capture/playback, lifecycle, and hot-path state sync.

## Local rules
- Keep speech-mode media direct from the renderer to Gemini Live; do not proxy audio or video through the backend or `src/main/`.
- Preserve DI/test seams such as `createDesktopSessionController(overrides)` and `setGeminiLiveSdkSessionConnectorForTests(...)` when adding I/O.
- Treat lifecycle, resumption, transport, and capture scheduling changes as behavior changes: update focused runtime tests in the same task.
- Avoid adding unnecessary work inside tight event handlers.

## Verification
- Start with the relevant runtime test file, then widen to `pnpm verify:desktop` when changes spill beyond this subtree.
