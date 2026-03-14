# apps/desktop/src/renderer/runtime AGENTS.md

## Purpose
Renderer session runtime for transport, capture/playback, session lifecycle, and runtime state sync on the realtime hot path.

## What belongs here
- Live transport orchestration, capture/playback controllers, session lifecycle, and runtime-facing state sync.

## What must not go here
- Raw Electron or Node access, or preload-only logic.
- Durable chat persistence or database logic; that belongs in chat-memory layers outside this subtree.
- General UI component architecture rules.

## Local conventions
- Keep the Gemini Live media path direct from the renderer; do not proxy audio or video through the backend.
- Access desktop capabilities through `window.bridge` adapters at the edges only.
- Preserve DI/test seams such as `createDesktopSessionController(overrides)` and `setGeminiLiveSdkSessionConnectorForTests(...)` when adding I/O.
- Treat lifecycle, resumption, and transport changes as behavior changes: update focused runtime tests with the code.
- Avoid adding extra work inside tight event handlers unless it is necessary and measured.

## Verification
- Start with the relevant `sessionController*.test.ts` or `transport/*test.ts` coverage, then use `pnpm verify:desktop` when the change affects broader desktop behavior.
