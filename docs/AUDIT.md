# Documentation Audit

**Audit date:** 2026-03-11

This file records the current repository status audit and points to the canonical docs that future work should treat as source of truth.

## Canonical Docs

- [README.md](../README.md): repo overview, current product behavior, setup, and source-of-truth index
- [docs/ARCHITECTURE.md](./ARCHITECTURE.md): current architecture and product-mode model
- [docs/MILESTONE_MATRIX.md](./MILESTONE_MATRIX.md): milestone-by-milestone status
- [docs/KNOWN_ISSUES.md](./KNOWN_ISSUES.md): current gaps, risks, and planned follow-up areas
- [docs/IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md): forward-looking work from the current stable baseline

## Verified Current-State Assertions

- User-facing product modes are `text` and `speech`.
- Runtime transport terminology still uses `voice` for the Gemini Live session path.
- `text` mode is backend-mediated through `POST /session/chat`.
- `speech` mode requests an ephemeral token from `POST /session/token` and then connects directly from the desktop to Gemini Live.
- `currentMode` is the product-level mode source of truth.
- `speechLifecycle` is the product-level speech-state source of truth.
- Speech-mode interruption, playback stop, transcript wiring, token refresh, and session resumption are implemented.
- Screen context is implemented only as manual start/stop capture during an active speech session.
- Voice-mode tool support is currently limited to narrow local inspection tools.
- Backend checkpoint persistence, backend-backed tool endpoints, and backend error reporting are not implemented yet.

## Code Entry Points Used For Verification

- `apps/api/src/session/session.controller.ts`
- `apps/api/src/session/session.service.ts`
- `apps/api/src/config/env.ts`
- `apps/desktop/src/renderer/store/sessionStore.ts`
- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
- `apps/desktop/src/renderer/runtime/sessionController.ts`
- `apps/desktop/src/renderer/runtime/sessionController.speechLifecycle.test.ts`
- `apps/desktop/src/renderer/runtime/sessionController.screenCapture.test.ts`
- `apps/desktop/src/renderer/runtime/sessionController.resumption.test.ts`
- `apps/desktop/src/renderer/runtime/voice/voiceTools.ts`

## Main Outdated Statements Corrected In This Cleanup

- Token issuance was documented in some places as still stubbed; it is implemented.
- The backend was described as token-only control-plane; it currently also serves text-mode chat streaming.
- The text-mode versus speech-mode product model was implicit; it is now explicit.
- Several diagrams presented planned checkpoint, tool, error-reporting, and adaptive-capture flows as if they were already live; those docs are now labeled or redrawn to match the current state.
