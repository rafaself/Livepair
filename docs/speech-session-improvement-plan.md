# Speech Session Improvement Plan

## Goal

Strengthen the speech-session feature by encoding the intended product contract in the runtime, reducing UI/runtime drift, improving maintainability, and adding operational clarity without weakening the current desktop -> Gemini Live architecture.

## Current Baseline

- The desktop requests an ephemeral token from the backend and connects directly to Gemini Live.
- Microphone capture is currently a separate action from session start, even though the UI often chains them.
- Transcript handling, interruption, playback, resumption, and outbound guardrails are already implemented.
- The backend remains out of the realtime audio/video path, which should not change.

## Target Outcome

- Starting speech mode means: connect the Live session and start microphone capture by default.
- The user can mute and unmute freely during an active session without ending the session.
- Runtime semantics own the product contract instead of relying on UI choreography.
- Session, microphone, transcript, and recovery states are easier to reason about internally and externally.
- Telemetry and diagnostics make failures and recovery behavior easier to evaluate in development and production.

## Milestone 1: Encode The Product Contract In The Runtime

### Objective

Make speech-session start semantics explicit and centralized.

### Scope

- Move default microphone startup behavior into the runtime/session orchestration layer.
- Keep explicit microphone controls as mute and unmute operations during an already active session.
- Remove the assumption that every UI entrypoint must manually compose `startSession()` and `startVoiceCapture()`.

### Expected Changes

- [apps/desktop/src/renderer/runtime/session/sessionPublicApi.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/session/sessionPublicApi.ts)
- [apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts)
- [apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts)
- [apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelComposerMediaActions.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelComposerMediaActions.ts)

### Success Criteria

- Starting speech mode always results in a connected session plus default microphone-on behavior.
- Muting does not end the session.
- Unmuting resumes capture without requiring a new session.
- Session-start semantics are defined once in runtime code, not duplicated in UI flows.

### Risks

- Accidentally breaking flows that rely on session-only connection behavior.
- Starting microphone capture too early, before Live readiness is actually established.

## Milestone 2: Clarify Runtime State Semantics

### Objective

Make the speech, capture, and assistant states easier to understand and map to the UI.

### Scope

- Review current session, capture, transcript, and lifecycle state names.
- Tighten internal state transitions so they better reflect product meaning.
- Ensure user-facing labels compress internal complexity into understandable status signals.

### Expected Changes

- [apps/desktop/src/renderer/store/sessionStore.types.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/store/sessionStore.types.ts)
- [apps/desktop/src/renderer/store/sessionStore.defaults.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/store/sessionStore.defaults.ts)
- [apps/desktop/src/renderer/store/sessionStore.actions.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/store/sessionStore.actions.ts)
- [apps/desktop/src/renderer/runtime/transport/transportEventRouterSessionHandlers.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/transport/transportEventRouterSessionHandlers.ts)
- [apps/desktop/src/renderer/runtime/speech/speechSessionLifecycle.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/speech/speechSessionLifecycle.ts)

### Success Criteria

- Internal states clearly distinguish:
  - session connecting
  - session active
  - microphone muted
  - microphone capturing
  - assistant speaking
  - recovery and resumption
- UI status language aligns with the actual runtime truth.
- Error states are easier to interpret from logs and store snapshots.

### Risks

- Over-refactoring a state model that already works.
- Introducing regressions in interruption and recovery flows.

## Milestone 3: Reduce Semantic Duplication Across UI And Runtime

### Objective

Improve maintainability by reducing the number of places that encode the same speech-session behavior.

### Scope

- Keep product rules inside the runtime/session layer.
- Simplify React handlers so they trigger intent, not low-level orchestration.
- Remove coupling where UI components must know too much about sequencing.

### Expected Changes

- [apps/desktop/src/renderer/runtime/useSessionRuntime.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/useSessionRuntime.ts)
- [apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelComposerMediaActions.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelComposerMediaActions.ts)
- [apps/desktop/src/renderer/App.tsx](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/App.tsx)

### Success Criteria

- UI hooks no longer need to remember fragile sequencing rules.
- Session behavior changes can be implemented in runtime code with minimal UI edits.
- Feature evolution becomes safer for future contributors.

### Risks

- Regressing special entrypoints like start-with-screen-share behavior.

## Milestone 4: Improve Operational Visibility And Diagnostics

### Objective

Raise infra and operational maturity for the speech path without changing the core architecture.

### Scope

- Expand telemetry around:
  - session start attempts
  - connect success and failure
  - microphone auto-start success and failure
  - mute and unmute transitions
  - transcript arrival timing
  - recovery and resumption outcomes
- Make store diagnostics more actionable during debugging.

### Expected Changes

- [apps/desktop/src/renderer/runtime/session/liveTelemetryCollector.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/session/liveTelemetryCollector.ts)
- [packages/shared-types/src/liveTelemetry.ts](/home/rafa/dev/Projects/Livepair/fork/packages/shared-types/src/liveTelemetry.ts) if additive payload changes are needed
- [apps/api/src/observability/dto/report-live-telemetry.dto.ts](/home/rafa/dev/Projects/Livepair/fork/apps/api/src/observability/dto/report-live-telemetry.dto.ts) if telemetry contracts change
- [apps/api/src/observability/live-telemetry.service.ts](/home/rafa/dev/Projects/Livepair/fork/apps/api/src/observability/live-telemetry.service.ts) if telemetry contracts change

### Success Criteria

- A failed speech start can be attributed quickly to token, connect, permission, capture, or transcript timing issues.
- Recovery quality can be evaluated from telemetry without manual log scraping.
- Additive telemetry changes do not alter the realtime media boundary.

### Risks

- Adding too much telemetry noise.
- Changing shared contracts without updating all consumers.

## Milestone 5: Tighten Tests Around The Real Product Contract

### Objective

Raise confidence by testing the behavior the product actually promises.

### Scope

- Add or update focused tests for:
  - start speech mode defaults to mic-on
  - mute preserves the active session
  - unmute resumes capture correctly
  - session start handles mic permission failures cleanly
  - reconnect and resume do not corrupt mute state
  - transcript handling remains correct after start-flow changes

### Expected Changes

- [apps/desktop/src/renderer/runtime/sessionController.lifecycle.test.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/sessionController.lifecycle.test.ts)
- [apps/desktop/src/renderer/runtime/sessionController.voiceCapture.test.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/sessionController.voiceCapture.test.ts)
- [apps/desktop/src/renderer/runtime/sessionController.speechLifecycle.test.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/sessionController.speechLifecycle.test.ts)
- [apps/desktop/src/renderer/runtime/sessionController.interruption.test.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/sessionController.interruption.test.ts)
- [apps/desktop/src/renderer/runtime/sessionController.resumption.test.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/sessionController.resumption.test.ts)
- [apps/desktop/src/renderer/runtime/voice/media/voiceChunkPipeline.test.ts](/home/rafa/dev/Projects/Livepair/fork/apps/desktop/src/renderer/runtime/voice/media/voiceChunkPipeline.test.ts) if needed

### Verification Strategy

- Start narrow:
  - `pnpm --filter @livepair/desktop test -- sessionController`
  - `pnpm --filter @livepair/desktop test -- voiceChunkPipeline`
- Widen when stable:
  - `pnpm verify:desktop`

### Success Criteria

- Tests assert product behavior directly, not only incidental implementation details.
- Speech start, mute, and recovery semantics are protected from regression.

## Milestone 6: Align Documentation With Runtime Truth

### Objective

Keep documentation synchronized with the implemented contract and operational model.

### Scope

- Update docs to reflect the refined speech-session semantics.
- Make clear that:
  - backend issues tokens only
  - desktop connects directly to Gemini Live
  - speech start defaults to mic-on
  - mute and unmute are in-session controls

### Expected Changes

- [docs/ARCHITECTURE.md](/home/rafa/dev/Projects/Livepair/fork/docs/ARCHITECTURE.md)
- [README.md](/home/rafa/dev/Projects/Livepair/fork/README.md) if the user-facing product description needs alignment

### Success Criteria

- Docs describe the actual implementation, not an approximation.
- Product language and runtime contract match.

## Cross-Cutting Guardrails

- Do not move realtime audio or video through the backend.
- Do not weaken Electron preload or main-process security boundaries.
- Do not add a new production dependency without confirmation.
- Keep the implementation small and targeted.
- Preserve current DI and test seams in runtime code.
- Prefer additive shared-contract changes only when telemetry expansion truly requires them.

## Scorecard Mapping

This plan is intended to improve the earlier scorecard in these areas:

- Product/UX coherence: Milestones 1, 2, 3, and 6
- Code quality: Milestones 1, 2, and 3
- Organization and modularity: Milestones 2 and 3
- Infra and operational shape: Milestone 4
- Testability and regression resistance: Milestone 5
- Reliability and recovery clarity: Milestones 2, 4, and 5

## Recommended Execution Order

1. Milestone 1
2. Milestone 5
3. Milestone 2
4. Milestone 3
5. Milestone 4
6. Milestone 6

This order keeps the core product contract first, then locks it with tests before broadening cleanup and observability work.

## Cannot Be Fully Verified From Current Context

- Real device-permission UX under Linux desktop variations
- Real-world Gemini Live transcript timing and latency
- Production-scale telemetry usefulness without runtime traffic samples
