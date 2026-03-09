# Release 3 Spec: Text-First Realtime Turn

## Goal

Prove a single real end-to-end interaction loop through the desktop runtime before adding microphone and screen streaming.

## Current Behavior

- UI and mock conversation components exist.
- Real session lifecycle is not yet connected to a text/event loop.
- Transcript behavior in the main flow remains simulated.

## Target Behavior

- One user text input can reach the model through the real session controller.
- Streamed response text updates the transcript state.
- Token and disconnect failures surface cleanly in the UI.

## Constraints

- Keep scope text-first.
- Do not add microphone or screen capture in this release.
- Preserve the direct client-to-Gemini architecture.

## Contracts / Interfaces

- Runtime transcript/event interfaces
- Any state updates needed for streaming text
- Shared contracts only if backend token or error payloads change

## Affected Modules

- `apps/desktop/src/renderer/runtime/*`
- `apps/desktop/src/renderer/components/features/*`
- `apps/desktop/src/renderer/store/*`

## Tests

- Add failing transcript streaming tests first
- Add a smoke test for the session-state flow
- Update feature tests to validate streamed text rendering
- Smallest relevant verification:
  - `pnpm typecheck:desktop`
  - `pnpm test:desktop`

## Acceptance Criteria

- A user input reaches the model through the real session stack
- Response text streams into transcript state
- Failure handling remains visible and recoverable
- The path is covered by a desktop smoke test

## Out Of Scope

- Audio upload
- Audio playback
- Screen streaming
- Tool invocation
