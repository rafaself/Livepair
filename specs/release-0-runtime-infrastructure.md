# Release 0 Spec: Runtime Infrastructure

## Goal

Create the minimum desktop runtime scaffolding required to replace the mock-driven session path with a real runtime in later releases, without yet introducing live Gemini traffic.

## Current Behavior

- The UI shell exists and the desktop app can request a session token.
- Conversation flow is still driven by `useMockSession`.
- Runtime state is represented as coarse UI/backend/token flags rather than a dedicated session runtime model.

## Target Behavior

- A desktop runtime layer exists outside feature components.
- Session lifecycle concerns are modeled separately from mock UI state.
- A transport adapter interface exists but is not yet connected to Gemini.
- Session and transport logging hooks exist for future debugging.

## Constraints

- Preserve Electron security invariants.
- Do not add production dependencies.
- Do not connect to Gemini Live API yet.
- Keep changes small and isolate new runtime modules from UI components.

## Contracts / Interfaces

- Internal desktop runtime interfaces only
- No shared API or IPC contract changes in this release

## Affected Modules

- `apps/desktop/src/renderer/runtime/*`
- `apps/desktop/src/renderer/store/*`
- `apps/desktop/src/renderer/components/features/*`

## Tests

- Add runtime state transition tests before implementation where practical
- Update controller tests to verify feature components consume runtime state instead of mock-only state
- Smallest relevant verification:
  - `pnpm typecheck:desktop`
  - `pnpm test:desktop`

## Acceptance Criteria

- A dedicated runtime session model exists
- Mock session flow is not the only path represented in state
- Transport adapter interface is isolated in one module
- Logging hooks exist for session and transport events

## Out Of Scope

- Real Gemini session connection
- Audio capture
- Screen streaming
- Checkpoint persistence
