# apps/desktop/src/renderer/runtime AGENTS.md

## Purpose
Renderer runtime: session controller, transports, capture/playback controllers, and state synchronization.

This code is performance-sensitive and event-driven.

## Boundaries
- No Electron/Node APIs here. Anything privileged must go through `window.bridge` (via small adapter modules like `src/renderer/api/backend.ts`).
- Keep the realtime hot path direct: transports talk to Gemini Live from the renderer; do not route media through the backend.

## Testability Rules
- Keep external interactions injectable:
  - `createDesktopSessionController(overrides)` is the DI seam for controller dependencies.
  - `setGeminiLiveSdkSessionConnectorForTests(...)` is the seam for transport connection in tests.
- Prefer small pure helpers; keep I/O at the edges so it’s easy to unit test.

## Change Discipline
- Treat session lifecycle + resumption as first-class: if you change transport/lifecycle logic, update/add tests (see `sessionController*.test.ts` and `runtime/transport/*test.ts`).
- Avoid adding work in tight event handlers without measuring impact (screen/audio capture, transport message handling).
