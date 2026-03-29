# 1. Purpose

This document records the current desktop Live runtime boundary as implemented today so SR-02 can introduce a single public runtime API without re-discovering where UI, stores, persistence, transport, audio, and screen-sharing concerns are currently coupled.

# 2. Current Runtime Surface

- `apps/desktop/src/renderer/runtime/index.ts`
  Re-export barrel used by renderer UI code; exposes `useSessionRuntime`, selectors, control-gating helpers, conversation types, and the controller singleton APIs.
- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
  Main React entry point used by `App.tsx` and assistant-panel hooks to read runtime-backed state from `useSessionStore` and call controller methods.
- `apps/desktop/src/renderer/runtime/public.ts`
  Type/helper surface imported by stores, hooks, chat-memory code, and UI components for lifecycle types, gating helpers, DTO mappers, and diagnostics defaults.
- `apps/desktop/src/renderer/runtime/selectors.ts`
  Selector surface used directly by UI and tests for assistant state, backend labels, text-submit readiness, and visible conversation timeline.
- `apps/desktop/src/renderer/runtime/sessionController.ts`
  Singleton/controller entry used by `useSessionRuntime.ts`; also the composition root that wires runtime internals to renderer stores, backend bridge calls, local media capture, and overlay masking state.

# 3. UI → Runtime Coupling Inventory

## App shell and panel control

- `apps/desktop/src/renderer/App.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Uses `useSessionRuntime()` as the app-shell runtime entry point for session start/stop, mic, screen share, and mode/status reads.
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts` -> `apps/desktop/src/renderer/runtime/index.ts`
  Pulls runtime state/types and action handlers into the assistant-panel controller.
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelControlState.ts` -> `apps/desktop/src/renderer/runtime/index.ts`
  Recomputes control gating in UI using runtime gating helpers.
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelComposerMediaActions.ts` -> `apps/desktop/src/renderer/runtime/index.ts`
  Uses runtime gating helpers to decide whether UI can start/end speech mode or toggle screen context.
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelConversationState.ts` -> `apps/desktop/src/renderer/runtime/selectors.ts`
  Uses a runtime selector to merge conversation turns and transcript artifacts for display.
- `apps/desktop/src/renderer/components/composite/ControlDock.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Imports runtime types for dock props.
- `apps/desktop/src/renderer/components/composite/controlDockUiState.ts` -> `apps/desktop/src/renderer/runtime/index.ts`
  Recomputes dock gating/labels from runtime helpers inside the UI layer.
- `apps/desktop/src/renderer/components/features/assistant-panel/chat/assistantPanelComposerAction.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Uses runtime gating helpers and runtime status types to decide composer actions.
- `apps/desktop/src/renderer/components/features/assistant-panel/chat/AssistantPanelChatView.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Depends on runtime conversation/timeline types and product/runtime status types.
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanelHeader.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Depends on `SpeechLifecycleStatus` from runtime for header state.
- `apps/desktop/src/renderer/components/features/conversation/ConversationList.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Consumes runtime `ConversationTimelineEntry` typing.
- `apps/desktop/src/renderer/components/features/conversation/ConversationTurn.tsx` -> `apps/desktop/src/renderer/runtime/index.ts`
  Uses runtime `isTranscriptArtifact()` and timeline types to render mixed conversation entries.

## Stores and hooks

- `apps/desktop/src/renderer/store/sessionStore.types.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Session store data model is built from runtime-owned types and diagnostics shapes.
- `apps/desktop/src/renderer/store/sessionStore.actions.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Store reset/default actions call runtime constructors for lifecycle and diagnostics state.
- `apps/desktop/src/renderer/store/sessionStore.defaults.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Store defaults derive lifecycle, transport state, and diagnostics from runtime helpers and constants.
- `apps/desktop/src/renderer/store/sessionStore.defaults.ts` -> `apps/desktop/src/renderer/runtime/screen/screenCaptureController.ts`
  UI/store defaults depend directly on runtime screen cadence constants.
- `apps/desktop/src/renderer/store/sessionStore.defaults.ts` -> `apps/desktop/src/renderer/runtime/screen/screenContextDiagnostics.ts`
  UI/store defaults depend directly on runtime visual-send diagnostics construction.
- `apps/desktop/src/renderer/store/captureExclusionRectsStore.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Overlay-rect store adopts a runtime-owned overlay visibility type.
- `apps/desktop/src/renderer/hooks/useCaptureExclusionRects.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Hook pushes DOM visibility state into a runtime-owned overlay visibility model.
- `apps/desktop/src/renderer/hooks/visibleOverlayRects.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  DOM-to-overlay snapshot code imports the runtime overlay visibility type.
- `apps/desktop/src/renderer/hooks/useVisibleOverlayRects.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Same overlay snapshot path depends on runtime overlay visibility typing.

## Persistence and rehydration

- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Chat-memory hydration maps persisted message records into runtime conversation-turn models.
- `apps/desktop/src/renderer/chatMemory/rehydrationPacket.test.ts` -> `apps/desktop/src/renderer/runtime/public.ts`
  Test-only, but confirms runtime currently owns the transport history mapping used for rehydration.

# 4. Runtime → UI Coupling Inventory

- `apps/desktop/src/renderer/runtime/sessionController.ts`
  Imports `useSessionStore`, `useSettingsStore`, and `useCaptureExclusionRectsStore`; runtime composition currently reads UI/store-owned state directly, including overlay masking state.
- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
  Runtime package includes a React hook; this is a renderer UI-facing adapter living inside the runtime tree rather than above it.
- `apps/desktop/src/renderer/runtime/selectors.ts`
  Imports `apps/desktop/src/renderer/state/assistantUiState.ts` and `apps/desktop/src/renderer/store/sessionStore.ts`; runtime selectors produce UI-facing assistant state labels from store data.
- `apps/desktop/src/renderer/runtime/core/debugMode.ts`
  Reads `useUiStore().isDebugMode`; runtime debug behavior depends on UI store state.
- `apps/desktop/src/renderer/runtime/core/logger.ts`
  Reads `useUiStore().isDebugMode`; runtime logging policy depends on UI debug mode.
- `apps/desktop/src/renderer/runtime/core/sessionControllerTypes.ts`
  Types the runtime against `typeof useSessionStore` and `typeof useSettingsStore`; runtime contracts are anchored to concrete renderer stores instead of neutral interfaces.
- `apps/desktop/src/renderer/runtime/conversation/conversationContext.ts`
  Conversation runtime state mutates `useSessionStore` data directly; runtime turn management owns store mutation details.
- `apps/desktop/src/renderer/runtime/conversation/persistConversationTurn.ts`
  Imports `../../chatMemory/currentChatMemory`; runtime conversation persistence calls renderer chat-memory helpers directly.
- `apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts`
  Imports `useUiStore`; screen-frame dump behavior depends on a UI debug toggle and writes a UI-visible dump directory path.
- `apps/desktop/src/renderer/runtime/session/sessionLifecycleAssembly.ts`
  Imports `../../chatMemory/currentChatMemory` and `../../liveSessions/currentLiveSession`; runtime lifecycle code owns renderer persistence/session-record orchestration directly.
- `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
  Imports `TokenRequestState` and `BackendConnectionState` from `store/sessionStore`; runtime token management depends on store-defined UI/backend state enums.
- `apps/desktop/src/renderer/runtime/screen/screenFrameMasking.ts`
  Uses overlay visibility values such as `'panel-open'` and `'panel-closed-dock-only'`; screen masking depends on renderer presentation concepts.
- `apps/desktop/src/renderer/runtime/screen/localScreenCapture.ts`
  Accepts capture-exclusion masking context containing overlay rectangles and overlay visibility; screen capture behavior is aware of renderer overlay layout state.

# 5. State Ownership Findings

## Confirmed findings

- `apps/desktop/src/renderer/store/sessionStore.ts`
  `useSessionStore` is the authoritative state container for current product mode, text lifecycle, speech lifecycle, transport status, conversation turns, transcript artifacts, audio/screen diagnostics, and error state.
- `apps/desktop/src/renderer/runtime/session/sessionStateSync.ts`
  Speech lifecycle truth is reduced into the store via `reduceSpeechSessionLifecycle(...)`; runtime code treats the store as the durable source after each event.
- `apps/desktop/src/renderer/store/sessionStore.defaults.ts`
  `sessionPhase` and `transportState` are derived fields recomputed from `textSessionLifecycle.status`.
- `apps/desktop/src/renderer/runtime/selectors.ts`
  `AssistantRuntimeState` is derived again from `assistantActivity`, `backendState`, `tokenRequestState`, and `textSessionLifecycle.status`; it is not stored directly.
- `apps/desktop/src/renderer/runtime/controlGating.ts`
  Control availability is derived again from `currentMode`, `speechLifecycleStatus`, `textSessionStatus`, `activeTransport`, `voiceSessionStatus`, `voiceCaptureState`, and `screenCaptureState`.
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelConversationState.ts`
  Visible conversation timeline is recomputed in UI from `conversationTurns` plus `transcriptArtifacts`.
- `apps/desktop/src/renderer/runtime/session/sessionModeSwitching.ts`
  Product mode truth is stored separately in `currentMode`, while speech activity is also inferable from `speechLifecycle.status`; mode switching has to consult both.
- `apps/desktop/src/renderer/runtime/session/sessionPublicApi.ts`
  Screen-share intent is stored separately as `screenShareIntended`, alongside `screenCaptureState`.

## Likely interpretation

- `apps/desktop/src/renderer/store/sessionStore.defaults.ts` and `apps/desktop/src/renderer/runtime/selectors.ts`
  The store currently mixes authoritative runtime state with projection-like UI state (`sessionPhase`, `transportState`, backend labels/input readiness inputs), so the projection boundary is not explicit yet.
- `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts` and `apps/desktop/src/renderer/runtime/session/sessionEndings.ts`
  `currentMode` appears to be the product truth for `inactive` vs `speech`, while `speechLifecycle.status` and `voiceSessionStatus` together describe runtime truth inside speech mode.

## Hypotheses / open questions

- `apps/desktop/src/renderer/store/sessionStore.types.ts`, `apps/desktop/src/renderer/runtime/selectors.ts`, and `apps/desktop/src/renderer/state/assistantUiState.ts`
  `AssistantRuntimeState` may be better treated as a pure projection owned by UI, but today the runtime package exports and computes it; current ownership is mixed.
- `apps/desktop/src/renderer/runtime/session/sessionModeSwitching.ts`, `apps/desktop/src/renderer/runtime/controlGating.ts`, and `apps/desktop/src/renderer/runtime/speech/speechSessionLifecycle.ts`
  `currentMode === 'speech'` and `isSpeechLifecycleActive(...)` can diverge during transitions by design; the intended long-term single source between them is not explicit in code comments.

# 6. Boundary Leak Findings

## Provider DTO leaks

- `apps/desktop/src/renderer/runtime/public.ts`
  Re-exports `GeminiLiveEffectiveVoiceSessionCapabilities` as a public runtime type, exposing provider-shaped capability DTOs beyond the transport boundary.
- `apps/desktop/src/renderer/store/sessionStore.types.ts`
  Persists `GeminiLiveEffectiveVoiceSessionCapabilities | null` in the app session store, so provider capability shape is part of app-visible state.
- `apps/desktop/src/renderer/runtime/transport/transport.types.ts`
  `DesktopSessionConnectParams` embeds `CreateEphemeralTokenResponse`; the transport interface depends on backend/provider token DTOs instead of a transport-local credential shape.
- `apps/desktop/src/renderer/runtime/session/sessionStateSync.ts`
  `syncVoiceDurabilityState()` accepts `CreateEphemeralTokenResponse | null`; provider/backend token DTO shape reaches state-sync code outside transport.
- `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts`
  Stores and returns `CreateEphemeralTokenResponse`; token provider DTO survives outside the transport adapter.

## Transport detail leaks

- `apps/desktop/src/renderer/runtime/controlGating.ts`
  UI gating depends on `LIVE_ADAPTER_KEY` from `transport/liveConfig.ts`, so transport identity leaks into UI policy.
- `apps/desktop/src/renderer/store/sessionStore.defaults.ts`
  Debug/runtime fallback state uses `LIVE_ADAPTER_KEY`, so a transport-specific key is embedded in store defaults.
- `apps/desktop/src/renderer/runtime/session/sessionPublicApi.ts`
  Text submit path checks `activeTransport.kind === LIVE_ADAPTER_KEY`, so public controller logic is transport-specific rather than transport-agnostic.
- `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts`
  Lifecycle logs and state setup call `getEffectiveVoiceSessionCapabilities(getLiveConfig())`, pulling Gemini-specific config/capability shaping above the transport adapter.

## Audio and screen boundary leaks

- `apps/desktop/src/renderer/runtime/sessionController.ts`
  Screen capture composition reads overlay rectangles, overlay visibility, selected capture source, and overlay display from renderer stores; screen runtime depends on UI overlay geometry.
- `apps/desktop/src/renderer/runtime/screen/screenFrameMasking.ts`
  Screen masking logic knows about presentation states `'hidden'`, `'panel-open'`, and `'panel-closed-dock-only'`.
- `apps/desktop/src/renderer/hooks/visibleOverlayRects.ts`
  DOM selectors `.control-dock` and `.panel.panel--open` produce runtime overlay visibility values, so UI layout directly shapes runtime masking inputs.
- `apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts`
  Runtime screen-frame dump behavior uses `useUiStore().saveScreenFramesEnabled` and writes back `screenFrameDumpDirectoryPath`; debug UI and runtime screen pipeline are directly coupled.
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkPipeline.ts`
  Runtime voice capture chooses selected input device from renderer settings store on every start, so device-selection policy is coupled directly into runtime media control.
- `apps/desktop/src/renderer/runtime/voice/media/voicePlaybackController.ts`
  Runtime playback chooses selected output device from renderer settings store, so playback routing is coupled directly to UI settings state.

# 7. Proposed SR-01 Boundary Map

- UI shell
  React components, panel controllers, dock view state, snackbar messaging, DOM overlay measurement, and settings/debug toggles. It should consume runtime snapshots and issue commands, but not import runtime internals beyond one public API surface.
- Live runtime public API
  A narrow renderer-facing facade that exposes commands (`startSession`, `endSpeechMode`, `submitTextTurn`, mic/screen actions), read-only snapshots/selectors, and stable runtime types. It should hide `sessionController.ts`, transport keys, provider DTOs, and store wiring details.
- Session engine
  The current cluster under `apps/desktop/src/renderer/runtime/session/*` that owns lifecycle transitions, mode switching, error handling, teardown, voice/session coordination, and conversation turn progression.
- Runtime supervisor
  The composition root that wires engine + adapters + stores. Today this role is split between `sessionController.ts` and `session/sessionControllerAssembly.ts`; SR-02 should make that split explicit without changing behavior.
- Projections/snapshots
  Current selectors and derived state such as assistant runtime state, control gating, visible conversation timeline, backend labels, and transport/session phase. These should be read models over store/runtime state rather than mixed into controller composition.
- Adapters
  Backend bridge (`renderer/api/backend.ts`), Gemini transport (`runtime/transport/*`), local audio (`runtime/audio/*`, `runtime/voice/media/*`), local screen capture (`runtime/screen/*`), chat-memory persistence (`renderer/chatMemory/*`), and live-session persistence (`renderer/liveSessions/*`). Adapters should be injected into the supervisor/engine, not imported from deep runtime modules.

# 8. Hotspots and Risk Ranking

- 1. `apps/desktop/src/renderer/runtime/sessionController.ts`
  Risk: highest; this is the current runtime composition root and directly binds runtime to stores, backend, settings, capture exclusion, and screen-capture policy.
  Likely later release: SR-02.
- 2. `apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts`
  Risk: high; it mixes session engine assembly with UI debug store reads, screen-frame dump wiring, and package/app metadata.
  Likely later release: SR-02 to SR-03.
- 3. `apps/desktop/src/renderer/runtime/session/sessionLifecycleAssembly.ts`
  Risk: high; lifecycle orchestration imports chat-memory and live-session persistence directly, so session truth and persistence are interleaved.
  Likely later release: SR-03.
- 4. `apps/desktop/src/renderer/runtime/public.ts`
  Risk: high; it is the de facto API surface but currently re-exports provider-shaped types, transport helpers, mappers, and UI-facing utilities together.
  Likely later release: SR-02.
- 5. `apps/desktop/src/renderer/store/sessionStore.types.ts`
  Risk: medium-high; app state shape is already tied to runtime/provider DTOs, so changing the public runtime surface without breaking UI/store assumptions will require care.
  Likely later release: SR-03.
- 6. `apps/desktop/src/renderer/runtime/selectors.ts`
  Risk: medium-high; selectors currently bridge runtime state into UI-owned `AssistantRuntimeState`, so extracting projections can easily change labels/edge-case behavior.
  Likely later release: SR-02.
- 7. `apps/desktop/src/renderer/runtime/screen/screenFrameMasking.ts` and `apps/desktop/src/renderer/runtime/screen/localScreenCapture.ts`
  Risk: medium-high; screen runtime depends on renderer overlay semantics and geometry, and a bad separation could break masking/privacy behavior.
  Likely later release: SR-03.
- 8. `apps/desktop/src/renderer/runtime/voice/session/voiceTokenManager.ts` and `apps/desktop/src/renderer/runtime/transport/transport.types.ts`
  Risk: medium; token/provider DTO leakage is broad but mechanically contained.
  Likely later release: SR-03.
- 9. `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelControlState.ts` and `apps/desktop/src/renderer/components/composite/controlDockUiState.ts`
  Risk: medium; control gating is duplicated in two UI paths, so boundary cleanup can regress speech/mic/screen affordances if not unified carefully.
  Likely later release: SR-02.

# 9. Recommended Next Step for SR-02

- Narrowest safe change
  Introduce one explicit renderer-facing Live runtime facade module that wraps the current controller singleton plus stable read-model selectors, then migrate `App.tsx` and assistant-panel hooks to import only from that facade.
- Likely files to touch
  `apps/desktop/src/renderer/runtime/public.ts`
  `apps/desktop/src/renderer/runtime/index.ts`
  `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
  `apps/desktop/src/renderer/runtime/sessionController.ts`
  `apps/desktop/src/renderer/App.tsx`
  `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts`
  `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelControlState.ts`
  `apps/desktop/src/renderer/components/composite/controlDockUiState.ts`
- What should not change yet
  Do not move store ownership, do not rewrite lifecycle/transport/audio/screen internals, do not change persistence flow, and do not remove existing derived selectors/gating logic until the single public API exists and UI imports are consolidated behind it.

# SR-02 Update

- Chosen public entry point
  `apps/desktop/src/renderer/runtime/liveRuntime.ts`
- Direct UI imports eliminated
  Renderer components, hooks, and `App.tsx` no longer import from `apps/desktop/src/renderer/runtime/index.ts`, `apps/desktop/src/renderer/runtime/public.ts`, or `apps/desktop/src/renderer/runtime/selectors.ts` directly; they now import from `liveRuntime.ts`.
- Still remaining for SR-03
  `sessionController.ts` still composes runtime internals directly against renderer stores and settings, store defaults still import runtime screen internals, and provider-shaped capability/token DTOs still exist in internal runtime/store surfaces.

# SR-03 Update

- Snapshot/projection surface introduced
  `apps/desktop/src/renderer/runtime/selectors.ts` now defines `LiveRuntimeSessionSnapshot`, `LiveRuntimeConversationSnapshot`, and `LiveRuntimeDiagnosticsSnapshot`.
  `apps/desktop/src/renderer/runtime/useSessionRuntime.ts` and `apps/desktop/src/renderer/runtime/liveRuntime.ts` now expose these through `useLiveRuntimeSessionSnapshot()`, `useLiveRuntimeConversationSnapshot()`, and `useLiveRuntimeDiagnosticsSnapshot()`.
- Duplicated derivation removed in this release
  `apps/desktop/src/renderer/components/composite/controlDockUiState.ts` no longer recomputes control gating from raw runtime fields; it consumes `ControlGatingSnapshot`.
  `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelControlState.ts` no longer rebuilds gating locally; it reads the runtime-owned projection from `LiveRuntimeSessionSnapshot`.
  `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelConversationState.ts` now consumes `LiveRuntimeConversationSnapshot` instead of rebuilding the timeline in the hook.
  `apps/desktop/src/renderer/components/features/assistant-panel/debug/AssistantPanelDebugView.tsx` now consumes `LiveRuntimeDiagnosticsSnapshot` instead of assembling debug state directly from `useSessionStore`.
  `apps/desktop/src/renderer/App.tsx`, `apps/desktop/src/renderer/components/composite/ControlDock.tsx`, and `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx` now pass runtime-owned projections through the SR-02 facade instead of passing raw lifecycle/transport fields for downstream recomputation.

# SR-04 Update

- Internal command contract introduced
  `apps/desktop/src/renderer/runtime/core/sessionCommand.types.ts` now defines the Live runtime's internal command vocabulary for session start/end, speech-mode end, backend health checks, voice capture, screen capture, manual screen analysis, and speech-mode text submission.
  `apps/desktop/src/renderer/runtime/session/sessionCommandDispatcher.ts` remains the single public-API routing point for those commands, and `apps/desktop/src/renderer/runtime/session/sessionPublicApi.ts` routes controller-facing session actions through it.
- Internal event contract introduced
  `apps/desktop/src/renderer/runtime/core/sessionEvent.types.ts` now defines the runtime's internal event vocabulary for session lifecycle, backend/token outcomes, transport connectivity, transcript updates, interruption, and turn-completion facts.
  `apps/desktop/src/renderer/runtime/session/sessionEventMapping.ts` maps the subset of normalized session events that should advance `speechLifecycle` into the existing speech lifecycle reducer, keeping lifecycle state changes driven by the event contract without introducing a separate event-bus framework.
- Runtime paths now using the contracts
  `apps/desktop/src/renderer/runtime/session/sessionLifecycle.ts` now records `session.start.requested` and delegates `session.ready` publication to the voice-connection path instead of driving those lifecycle transitions through separate ad hoc calls.
  `apps/desktop/src/renderer/runtime/session/sessionRuntime.ts` now records normalized `SessionEvent`s and applies lifecycle-relevant events through the mapper before logging/debug publication.
  `apps/desktop/src/renderer/runtime/session/sessionVoiceConnection.ts` and `apps/desktop/src/renderer/runtime/voice/session/connectFallbackVoiceSession.ts` now publish `session.ready` through the session event contract when a restored or fallback Live connection becomes usable.
  `apps/desktop/src/renderer/runtime/transport/transportEventRouterSessionHandlers.ts` now normalizes connection-state, go-away, termination, resumption-update, transport-error, and audio-error facts into `SessionEvent`s.
  `apps/desktop/src/renderer/runtime/transport/transportEventRouterTurnHandlers.ts` now normalizes interruption, transcript updates, assistant-output start, and turn-completion facts into `SessionEvent`s while leaving the existing transcript/playback/store responsibilities in place.
- Intentionally left for the next release
  Session teardown still applies a few speech lifecycle transitions directly instead of routing every shutdown path through the session event contract.
  Transcript persistence, assistant-draft mutation, playback queue management, and voice-tool execution still live in their existing modules; SR-04 only normalizes the highest-value session facts around those flows.
- Remaining state ownership issues left for later releases
  `useSessionStore` remains the authoritative runtime state container; snapshots are read-only projections over that store, not a store replacement.
  `sessionPhase`, `transportState`, and provider-shaped capability/token fields still live in the store and remain outside the new snapshot boundary.
  `sessionController.ts` and `session/*` still own store mutation and lifecycle orchestration directly; SR-03 did not extract a session engine or supervisor boundary.
  Overlay masking, selected devices, and screen-share intent are still split across runtime/store/settings layers and remain follow-up work for SR-04+.
