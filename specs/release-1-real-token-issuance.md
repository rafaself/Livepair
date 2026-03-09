# Release 1 Spec: Real Token Issuance

## Goal

Replace the stubbed backend token issuance path with a production-real ephemeral token flow that the desktop can use for a real Gemini Live session.

## Current Behavior

- `/session/token` returns a placeholder token from the backend service.
- `CreateEphemeralTokenResponse` encodes `isStub: true`.
- Desktop code only proves that a token request succeeded, not that the token is usable.

## Target Behavior

- `/session/token` returns a real ephemeral token and expiry metadata.
- Shared types no longer describe the token response as permanently stub-only.
- Success and failure paths are covered by backend tests.

## Constraints

- Never ship a permanent API key in the client.
- Keep the backend as control plane only.
- Do not proxy audio or video through the backend.
- No new production dependencies without explicit approval.

## Contracts / Interfaces

- `CreateEphemeralTokenResponse`
- backend session service behavior
- any related DTO or validation docs if needed

## Affected Modules

- `packages/shared-types/src/*`
- `apps/api/src/session/*`
- `apps/desktop/src/renderer/api/*`
- `apps/desktop/src/main/*` only if error handling or token metadata presentation changes

## Tests

- Add failing backend tests for success and provider-failure behavior first
- Update shared type assertions
- Update desktop request-path tests if the response shape changes
- Smallest relevant verification:
  - `pnpm test:shared-types`
  - `pnpm test:api`
  - `pnpm typecheck`

## Acceptance Criteria

- Backend returns real ephemeral token metadata
- Shared contracts reflect real behavior
- Failure paths are explicit and tested
- Desktop path remains typed end to end

## Out Of Scope

- Real session connection
- Reconnect logic
- Audio or screen capture
