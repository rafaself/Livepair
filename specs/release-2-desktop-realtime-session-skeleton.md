# Release 2 Spec: Desktop Realtime Session Skeleton

## Goal

Replace the token-only UI transition with a real desktop session lifecycle that can connect, disconnect, and surface runtime failures without yet handling full AV streaming complexity.

## Current Behavior

- Starting a session requests a token and updates UI state locally.
- The conversation transcript is still mock-driven.
- There is no dedicated desktop session controller or transport adapter module in use.

## Target Behavior

- Desktop session lifecycle is driven by a session controller.
- Transport behavior is isolated in one adapter module.
- UI reflects actual connection state and failures.
- Mock session behavior is removed from the main happy path.

## Constraints

- Preserve preload-only privileged access.
- Keep model-specific behavior isolated to one runtime module.
- Avoid adding speculative abstractions beyond the documented MVP path.

## Contracts / Interfaces

- Internal desktop runtime interfaces
- Any new runtime event types if needed
- No generic IPC passthrough channels

## Affected Modules

- `apps/desktop/src/renderer/runtime/*`
- `apps/desktop/src/renderer/components/features/*`
- `apps/desktop/src/renderer/store/*`
- `apps/desktop/src/main/*` only if session orchestration needs narrow IPC support

## Tests

- Add failing session-state tests first
- Add transport adapter tests around connect/disconnect/failure transitions
- Update feature controller tests to assert real runtime state usage
- Smallest relevant verification:
  - `pnpm typecheck:desktop`
  - `pnpm test:desktop`

## Acceptance Criteria

- Desktop can connect and disconnect cleanly
- Runtime state is event-driven
- Main happy path no longer depends on `useMockSession`
- Failure states are visible and recoverable

## Out Of Scope

- Audio capture and playback
- Screen streaming
- Checkpoint persistence
