# Implementation Roadmap

**Last updated:** 2026-03-15

This roadmap is forward-looking from the current stable baseline. For completed-release status, see [docs/MILESTONE_MATRIX.md](./MILESTONE_MATRIX.md).

## Current Baseline

Already implemented:

- typed turns over the active Gemini Live session (no standalone backend text endpoint)
- Gemini Live ephemeral token issuance through `POST /session/token`
- SDK-backed Gemini Live speech transport
- local microphone capture and assistant audio playback
- local interruption/barge-in handling
- transcript event handling and transcript state wiring
- single-surface speech chat through the shared conversation timeline
- manual speech-mode screen-context capture with frame upload
- speech-session resumption, token refresh, and explicit degraded-state handling
- S1 complete: mode exclusivity lock
- S4 complete: speech lifecycle lock
- product state sources of truth: `currentMode` and `speechLifecycle`
- visible speech-turn source of truth: `conversationTurns`
- retained compatibility-only speech transcript mirror: `currentVoiceTranscript`

## Remaining Roadmap

### Release 6: Session Checkpointing And Recovery

**Status:** Planned

Needed outcome:

- persist a minimal checkpoint outside the desktop process
- restore enough context to resume usefully after reconnect or restart
- keep the stored shape small and typed

Not implemented yet:

- checkpoint endpoints
- shared checkpoint contracts
- Redis-backed persistence
- restore flow

### Release 7: Lightweight Screen Streaming Hardening

**Status:** Partial

Already present:

- manual start/stop screen capture during an active speech session
- lightweight frame upload through the Live transport

Still needed:

- adaptive capture policy
- tuning and guardrails
- clearer operational limits for demo use

### Release 8: Error Reporting And Operational Hardening

**Status:** Partial

Already present:

- token refresh before resume when required
- explicit degraded-state handling
- speech-session resumption flow

Still needed:

- backend error-report endpoint
- structured server-side error collection
- broader diagnostics and failure visibility

### Release 9: One Demo-Critical Tool

**Status:** Planned

Needed outcome:

- one narrow backend-backed tool if the chosen demo truly requires it

Current limitation:

- only local inspection tools exist in speech mode today

### Release 10: Demo Readiness Pass

**Status:** Planned

Needed outcome:

- repeatable happy path
- acceptable failure handling
- final validation against the documented MVP boundaries

## Public Interface Expectations For Remaining Work

- new shared contracts will be required for checkpoints, backend error reporting, and any backend-backed tool
- privileged desktop capabilities must remain behind typed preload APIs only
- `currentMode` and `speechLifecycle` remain the product-level sources of truth for mode and speech-state
- docs must continue to distinguish clearly between the inactive/history shell and the direct Gemini Live `speech` session; typed turns today reuse the active Live session rather than a backend text endpoint
- shipped speech chat uses one primary visible conversation surface; `currentVoiceTranscript` is retained as an internal compatibility mirror only

## Validation Focus For Remaining Work

- API tests for checkpointing and error reporting when those endpoints are added
- desktop runtime tests for resumption, interruption, single-surface speech turns, screen capture, and failure handling
- contract/type tests for any new shared payloads
- focused smoke tests for demo-critical flows only

## Assumptions

- the MVP remains "Fast mode first"; Thinking mode stays deferred
- no new production dependencies are added without explicit approval
- Redis should not be introduced into runtime behavior until checkpoint work actually starts
