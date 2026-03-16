# Livepair Performance Audit

## Executive summary

This audit found four confirmed high-priority bottlenecks that materially affect Livepair's user-facing responsiveness:

1. The desktop renderer blocks first paint on async bootstrap work, including device probing, screen-source enumeration, and full chat hydration.
2. The live-session hot path publishes debug and diagnostic state into the renderer store at audio/event frequency, even when the debug UI is closed.
3. Streaming conversation updates trigger full-array store churn and repeated timeline recomputation, which increases renderer work during active sessions.
4. Microphone capture does frequent PCM processing on the renderer main thread after copying buffers out of the AudioWorklet.

The repo already has useful observability for API latency and live-session state, so the plan below reuses those surfaces instead of proposing a second diagnostics system.

## Existing diagnostics and observability used in this audit

### API / Node

- `apps/api/src/observability/observability.service.ts`
  - Prometheus counters and histograms for HTTP requests, request duration, errors, Gemini token provisioning outcomes, and session-token outcomes.
- `apps/api/src/observability/http-metrics.middleware.ts`
  - Measures request duration with `process.hrtime.bigint()`.
- `infra/observability/README.md`
  - Local Prometheus + Grafana stack already wired to `GET /metrics`.
- Verified during this audit:
  - `pnpm --filter @livepair/api test -- observability/observability.http.spec.ts session/session.observability.http.spec.ts`
  - Result: passing.

### Desktop / renderer / live runtime

- `apps/desktop/src/renderer/store/sessionStore.types.ts`
  - Stores runtime diagnostics for voice latency, voice capture/playback, screen capture, visual send policy, realtime outbound gateway, token/backend state, and runtime errors.
- `apps/desktop/src/renderer/components/features/assistant-panel/debug/AssistantPanelDebugView.tsx`
  - Existing developer debug panel that already exposes those runtime diagnostics.
- `apps/desktop/src/renderer/runtime/session/sessionStateSync.ts`
  - Tracks latency milestones such as session start, session ready, user speech detected, and assistant output started.
- `apps/desktop/src/renderer/runtime/core/logger.ts`
  - Runtime logging surface for session, transport, lifecycle, and scoped diagnostics.

### Audit caveat

- Focused desktop verification surfaced an existing baseline issue:
  - `pnpm --filter @livepair/desktop test -- src/renderer/bootstrap.test.ts src/renderer/runtime/transport/transportEventRouter.test.ts src/renderer/runtime/voice/media/voiceChunkPipeline.test.ts`
  - `bootstrap.test.ts` and `transportEventRouter.test.ts` passed in that run.
  - `voiceChunkPipeline.test.ts` failed on current branch expectations around capture diagnostics, so it is not a clean validation gate right now.

## Priority ranking

### P0

1. Startup is blocked before first paint.
2. Live hot paths publish debug/diagnostic state at event frequency.
3. Conversation timeline updates cause broad renderer churn during streaming.
4. Microphone capture does high-frequency main-thread audio work.

### P1

1. Chat-memory hydration and history flows do duplicate round-trips and unbounded reads.
2. End-session summary generation rereads and resorts full chat history inside a transaction.

## Confirmed bottlenecks

### P0-1: Renderer startup is blocked on async bootstrap before first paint

**Where**

- `apps/desktop/src/renderer/main.tsx`
- `apps/desktop/src/renderer/bootstrap.ts`
- `apps/desktop/src/renderer/store/uiStore.ts`
- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts`
- `apps/desktop/src/main/ipc/screen/registerScreenIpcHandlers.ts`

**Why it is expensive**

- `main.tsx` waits for `bootstrapDesktopRenderer()` to finish before calling `renderApp()`.
- `bootstrapDesktopRenderer()` awaits:
  - settings hydration,
  - device initialization,
  - screen-source hydration,
  - current-chat hydration.
- `initializeDevicePreferences()` in `uiStore.ts` first calls `navigator.mediaDevices.getUserMedia({ audio: true })` just to expose output devices, then enumerates devices, and may persist fallback settings.
- `hydrateScreenCaptureSources()` calls `window.bridge.listScreenCaptureSources()`, which crosses preload + IPC and then calls `desktopCapturer.getSources(...)` in the main process.
- `hydrateCurrentChat()` fetches/creates the current chat and then loads the full message list before the app renders.

**Likely user-visible symptom**

- Slow cold start and delayed overlay responsiveness.
- Startup may feel hung while permissions, desktop source enumeration, or chat history loading are happening.
- Startup cost will worsen as chat history grows.

**Evidence**

- `apps/desktop/src/renderer/main.tsx` renders only inside `.finally(() => renderApp())`.
- `apps/desktop/src/renderer/bootstrap.ts` serially awaits these flows before returning.
- `apps/desktop/src/main/ipc/screen/registerScreenIpcHandlers.ts` performs `desktopCapturer.getSources(...)` for `listScreenCaptureSources`.
- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts` loads the full current chat message list before returning from hydration.

**Confidence**

- High.

**Smallest effective remediation**

- Render the shell immediately with lightweight defaults.
- Defer device probing, screen-source enumeration, and full chat-message hydration until after first paint or until the relevant UI flow actually needs them.
- Keep current error handling, but move non-critical startup work off the blocking render path.

### P0-2: Live hot paths publish debug and diagnostics into the store at event frequency

**Where**

- `apps/desktop/src/renderer/runtime/transport/transportEventRouter.ts`
- `apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts`
- `apps/desktop/src/renderer/runtime/session/sessionMutableRuntime.ts`
- `apps/desktop/src/renderer/runtime/outbound/realtimeOutboundGateway.ts`
- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureRuntime.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceCaptureBinding.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voicePlaybackController.ts`

**Why it is expensive**

- `transportEventRouter.ts` writes `lastDebugEvent` to the store for every inbound transport event, regardless of whether debug mode is enabled.
- `localVoiceCaptureRuntime.ts` emits capture diagnostics for every encoded chunk.
- `sessionControllerAssembly.ts` wires outbound gateway diagnostics directly into `setRealtimeOutboundDiagnostics(...)`.
- `realtimeOutboundGateway.ts` publishes diagnostics on every submit and success/failure transition.
- `voicePlaybackController.ts` updates playback diagnostics from each playback observer event.

**Likely user-visible symptom**

- Higher renderer CPU during live sessions.
- More subscription churn in Zustand during voice capture/playback.
- Increased risk of UI jank and reduced responsiveness while audio is active.

**Evidence**

- `localVoiceCaptureRuntime.ts` increments `chunkCount` and emits diagnostics per chunk.
- `transportEventRouter.ts` always calls `store.setLastDebugEvent(...)` before routing the event.
- `sessionMutableRuntime.ts` creates one outbound gateway with `onDiagnosticsChanged`, and `sessionControllerAssembly.ts` writes every change into the store.

**Confidence**

- High.

**Smallest effective remediation**

- Keep collecting raw diagnostics locally, but publish them to the store only when debug mode is enabled or at a coarse sample cadence.
- Gate `lastDebugEvent` updates behind the existing debug/logging switches.
- Preserve the current debug panel; do not create a second diagnostics system.

### P0-3: Streaming conversation updates cause full-array churn and repeated timeline recomputation

**Where**

- `apps/desktop/src/renderer/store/sessionStore.actions.ts`
- `apps/desktop/src/renderer/runtime/selectors.ts`
- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx`
- `apps/desktop/src/renderer/components/features/assistant-panel/chat/AssistantPanelConversationSection.tsx`
- `apps/desktop/src/renderer/components/features/conversation/ConversationList.tsx`
- `apps/desktop/src/renderer/runtime/voice/transcript/voiceTranscriptStoreSync.ts`
- `apps/desktop/src/renderer/runtime/conversation/assistantDraftLifecycle.ts`
- `apps/desktop/src/renderer/runtime/conversation/voiceTranscriptArtifactLifecycle.ts`

**Why it is expensive**

- `updateConversationTurn(...)` maps the entire `conversationTurns` array for each update.
- `updateTranscriptArtifact(...)` maps the full `transcriptArtifacts` array for each update.
- `selectVisibleConversationTimeline(...)` rebuilds, concatenates, and sorts the entire visible timeline each time it is selected.
- `useSessionRuntime()` exposes `conversationTurns` and many other session fields together, and it is consumed by both `App.tsx` and the assistant-panel controller.
- The chat view ultimately re-renders `ConversationList`, which re-walks all turns and performs scroll logic on updates.

**Likely user-visible symptom**

- Choppy scrolling and reduced panel smoothness while assistant text or transcripts stream in.
- Larger histories will make live updates progressively more expensive.

**Evidence**

- `selectVisibleConversationTimeline(...)` spreads both arrays and sorts them every time.
- `AssistantPanel.tsx` reads `conversationTurns` via `useAssistantPanelController()`, which in turn reads from `useSessionRuntime()`.
- Transcript and draft updates flow through `voiceTranscriptStoreSync.ts` and `voiceTranscriptArtifactLifecycle.ts`, which update store-backed arrays during streaming.

**Confidence**

- High.

**Smallest effective remediation**

- Stop routing timeline data through the broad `useSessionRuntime()` surface.
- Subscribe the chat timeline closer to the chat view with narrower selectors.
- Preserve ordering via ordinals, but avoid rebuilding and resorting the full timeline for every streaming delta.

### P0-4: Microphone capture performs high-frequency audio processing on the renderer main thread

**Where**

- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureProcessor.worklet.js`
- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureRuntime.ts`
- `apps/desktop/src/renderer/runtime/audio/audioProcessing.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkPipeline.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkDispatch.ts`

**Why it is expensive**

- The AudioWorklet posts copied channel buffers every render quantum (`128` samples).
- At common input sample rates, that is roughly 345-375 worklet messages per second.
- The renderer thread then:
  - mixes channels,
  - resamples,
  - encodes PCM16,
  - chunks bytes,
  - enqueues outbound sends,
  - publishes diagnostics.
- `audioProcessing.ts` allocates merged buffers during resampling/chunking.

**Likely user-visible symptom**

- Voice capture competes directly with React/render work on the renderer main thread.
- This can degrade live-session responsiveness and panel smoothness during speech.

**Evidence**

- `localVoiceCaptureProcessor.worklet.js` copies `Float32Array` channel buffers and posts them every `process(...)` call.
- `localVoiceCaptureRuntime.ts` receives those messages and does PCM work before emitting chunks.
- `audioProcessing.ts` uses array concatenation and per-sample loops in the hot path.

**Confidence**

- High.

**Smallest effective remediation**

- Keep PCM conversion and chunk formation inside the AudioWorklet or another non-UI execution boundary.
- Reduce per-quantum allocations and avoid repeated concatenation in the renderer thread.
- Maintain the current PCM contract (`pcm_s16le`, mono, 16 kHz, 20 ms chunks).

### P1-1: Chat-memory hydration and history flows do duplicate round-trips and unbounded reads

**Where**

- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/chat/useAssistantPanelChatSessionData.ts`
- `apps/desktop/src/main/ipc/chat/registerChatIpcHandlers.ts`
- `apps/desktop/src/main/backend/backendClient.ts`
- `apps/api/src/chat-memory/chat-memory.service.ts`
- `apps/api/src/chat-memory/chat-memory.repository.ts`

**Why it is expensive**

- Startup hydration loads full message history for the current chat.
- `useAssistantPanelChatSessionData.ts` separately fetches:
  - the active chat record,
  - the latest live session.
- `ChatMemoryService.listMessages()`, `getChatSummary()`, and `listLiveSessions()` first call `ensureChatExists(...)`, which adds an extra database query before the main query.
- `listMessages(...)` returns the full history with no pagination or bounding for UI hydration.

**Likely user-visible symptom**

- Slower startup and chat switching as histories grow.
- More main-process, API, and DB work than necessary for read-mostly flows.

**Confidence**

- High.

**Smallest effective remediation**

- Stop blocking startup on full history reads.
- Collapse duplicate fetches where possible.
- Remove preflight existence checks when the main query can determine not-found behavior.
- Add bounded loading for UI hydration if history growth becomes material.

### P1-2: End-session summary generation rereads and resorts full chat history inside a transaction

**Where**

- `apps/api/src/chat-memory/chat-memory.service.ts`
- `apps/api/src/chat-memory/chat-memory.repository.ts`
- `apps/api/src/chat-memory/chat-summary.ts`

**Why it is expensive**

- `endLiveSession()` ends the session, loads all chat messages, sorts them, builds a summary, then potentially upserts it before the transaction completes.
- The cost grows with chat length even though the summary itself only uses a compact recent slice.

**Likely user-visible symptom**

- Slower session-end persistence for long chats.
- Longer transaction duration and avoidable DB work.

**Confidence**

- Medium-high.

**Smallest effective remediation**

- Avoid rereading the entire chat history at session end.
- Rebuild from a bounded recent window or maintain incremental summary inputs outside the terminal transaction.

## Suspected bottlenecks that still need measurement

These are plausible, but the current codebase evidence is not strong enough to rank them above the confirmed issues.

### Overlay rect tracking and animation-loop work

- `apps/desktop/src/renderer/hooks/useVisibleOverlayRects.ts`
- Suspicion:
  - full-body `MutationObserver`,
  - repeated `requestAnimationFrame` loop during transitions,
  - JSON stringification of rect snapshots.
- Needed measurement:
  - renderer trace while opening/closing panel under real interaction.

### Screen-capture encode/send timing under real shared-screen load

- `apps/desktop/src/renderer/runtime/screen/localScreenCapture.ts`
- `apps/desktop/src/renderer/runtime/screen/controller/screenFrameSendCoordinator.ts`
- Suspicion:
  - JPEG encoding and frame-to-Uint8Array conversion may spike under larger displays or burst mode.
- Needed measurement:
  - encode duration, send duration, drop counts, and frame age in the existing screen diagnostics path.

### Electron transparent overlay GPU/compositor cost

- `apps/desktop/src/main/window/overlayWindow.ts`
- Suspicion:
  - transparent, always-on-top, full-display overlay windows can behave differently by platform/GPU.
- Needed measurement:
  - Electron startup trace and compositor timing on target demo hardware.

### Chat-memory query-plan health on larger datasets

- `apps/api/src/chat-memory/chat-memory.repository.ts`
- Suspicion:
  - current queries are straightforward, but the audit did not run `EXPLAIN ANALYZE` on production-like table sizes.
- Needed measurement:
  - DB query plans and latency percentiles with realistic history volumes.

## Exact files/modules involved

### Startup and Electron

- `apps/desktop/src/renderer/main.tsx`
- `apps/desktop/src/renderer/bootstrap.ts`
- `apps/desktop/src/renderer/store/uiStore.ts`
- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts`
- `apps/desktop/src/main/ipc/screen/registerScreenIpcHandlers.ts`
- `apps/desktop/src/main/desktopCapture/captureSourceRegistry.ts`
- `apps/desktop/src/main/window/overlayWindow.ts`

### Renderer state and UI

- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
- `apps/desktop/src/renderer/runtime/selectors.ts`
- `apps/desktop/src/renderer/store/sessionStore.actions.ts`
- `apps/desktop/src/renderer/store/sessionStore.types.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/AssistantPanel.tsx`
- `apps/desktop/src/renderer/components/features/assistant-panel/chat/AssistantPanelConversationSection.tsx`
- `apps/desktop/src/renderer/components/features/conversation/ConversationList.tsx`
- `apps/desktop/src/renderer/components/features/conversation/ConversationTurn.tsx`

### Live runtime

- `apps/desktop/src/renderer/runtime/transport/transportEventRouter.ts`
- `apps/desktop/src/renderer/runtime/transport/transportEventRouterTurnHandlers.ts`
- `apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts`
- `apps/desktop/src/renderer/runtime/session/sessionMutableRuntime.ts`
- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureProcessor.worklet.js`
- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureRuntime.ts`
- `apps/desktop/src/renderer/runtime/audio/audioProcessing.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceCaptureBinding.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkPipeline.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkDispatch.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voicePlaybackController.ts`
- `apps/desktop/src/renderer/runtime/outbound/realtimeOutboundGateway.ts`

### API and persistence

- `apps/desktop/src/main/ipc/chat/registerChatIpcHandlers.ts`
- `apps/desktop/src/main/backend/backendClient.ts`
- `apps/api/src/observability/observability.service.ts`
- `apps/api/src/observability/http-metrics.middleware.ts`
- `apps/api/src/session/session.service.ts`
- `apps/api/src/session/gemini-auth-token.client.ts`
- `apps/api/src/chat-memory/chat-memory.controller.ts`
- `apps/api/src/chat-memory/chat-memory.service.ts`
- `apps/api/src/chat-memory/chat-memory.repository.ts`
- `apps/api/src/chat-memory/chat-summary.ts`
- `apps/api/src/database/database.service.ts`

## Proposed remediation waves

### Wave 1: Unblock first paint

**Goal**

- Make the desktop shell render immediately instead of waiting for non-critical async bootstrap work.

**Scope**

- `apps/desktop/src/renderer/main.tsx`
- `apps/desktop/src/renderer/bootstrap.ts`
- `apps/desktop/src/renderer/store/uiStore.ts`
- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts`
- `apps/desktop/src/main/ipc/screen/registerScreenIpcHandlers.ts`

**Expected impact**

- High improvement in perceived startup speed and overlay responsiveness.

**Implementation notes**

- Render with defaults first.
- Move microphone/device probing, screen-source enumeration, and full chat hydration to post-paint or on-demand flows.
- Reuse existing runtime error surfaces rather than inventing new startup UI plumbing.

**Risks / dependencies**

- The UI must tolerate short-lived loading states for devices, screen sources, and history.
- Do not change Electron security boundaries or preload shape.

### Wave 2: Remove non-essential diagnostics churn from live hot paths

**Goal**

- Keep observability, but stop publishing store updates at audio/event frequency unless the user is actively debugging.

**Scope**

- `apps/desktop/src/renderer/runtime/transport/transportEventRouter.ts`
- `apps/desktop/src/renderer/runtime/session/sessionControllerAssembly.ts`
- `apps/desktop/src/renderer/runtime/session/sessionMutableRuntime.ts`
- `apps/desktop/src/renderer/runtime/outbound/realtimeOutboundGateway.ts`
- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureRuntime.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voicePlaybackController.ts`

**Expected impact**

- High reduction in renderer work during active voice sessions.

**Implementation notes**

- Preserve existing counters and debug UI.
- Publish to store only on state transitions, bounded cadence, or when debug mode is enabled.
- Reuse the existing assistant-panel debug surface as the consumer.

**Risks / dependencies**

- Focused runtime tests will need updates because some current tests assume immediate diagnostic publication.
- Recommended downstream skills:
  - `live-api-realtime-review`
  - `tdd-implementer`

### Wave 3: Narrow conversation subscriptions and stop rebuilding the full timeline on each delta

**Goal**

- Make streaming text/transcript updates affect only the conversation UI that actually needs them.

**Scope**

- `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
- `apps/desktop/src/renderer/runtime/selectors.ts`
- `apps/desktop/src/renderer/store/sessionStore.actions.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/useAssistantPanelController.ts`
- `apps/desktop/src/renderer/components/features/conversation/ConversationList.tsx`
- conversation/transcript lifecycle modules that currently map whole arrays

**Expected impact**

- High improvement in panel smoothness during active sessions.

**Implementation notes**

- Move timeline subscription closer to the chat view.
- Preserve timeline ordinals, but avoid clone + sort on every streaming event.
- Avoid routing conversation data through `App.tsx` or broad runtime hooks.

**Risks / dependencies**

- Must preserve transcript ordering and persistence semantics.
- Recommended downstream skills:
  - `live-api-realtime-review`
  - `tdd-implementer`

### Wave 4: Move microphone PCM work off the renderer main thread

**Goal**

- Reduce main-thread pressure while the user is speaking.

**Scope**

- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureProcessor.worklet.js`
- `apps/desktop/src/renderer/runtime/audio/localVoiceCaptureRuntime.ts`
- `apps/desktop/src/renderer/runtime/audio/audioProcessing.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkPipeline.ts`
- `apps/desktop/src/renderer/runtime/voice/media/voiceChunkDispatch.ts`

**Expected impact**

- High improvement in live-session responsiveness and lower renderer contention.

**Implementation notes**

- Keep the current PCM contract and direct desktop-to-Gemini path.
- Prefer moving conversion/chunking closer to the AudioWorklet boundary rather than adding backend involvement.

**Risks / dependencies**

- Audio ordering and chunk timing are behavior-sensitive.
- Recommended downstream skills:
  - `live-api-realtime-review`
  - `tdd-implementer`

### Wave 5: Trim chat-memory round-trips and growth-sensitive reads

**Goal**

- Reduce unnecessary renderer → main → API → DB work on chat hydration and navigation paths.

**Scope**

- `apps/desktop/src/renderer/chatMemory/currentChatMemory.ts`
- `apps/desktop/src/renderer/components/features/assistant-panel/chat/useAssistantPanelChatSessionData.ts`
- `apps/desktop/src/main/ipc/chat/registerChatIpcHandlers.ts`
- `apps/desktop/src/main/backend/backendClient.ts`
- `apps/api/src/chat-memory/chat-memory.service.ts`
- `apps/api/src/chat-memory/chat-memory.repository.ts`

**Expected impact**

- Medium improvement to startup, chat switching, and history navigation.

**Implementation notes**

- Collapse duplicate fetches.
- Stop preloading full history before first paint.
- Remove redundant existence-check queries where safe.
- If pagination or bounded reads change contract shape, update shared surfaces centrally.

**Risks / dependencies**

- Contract changes may require coordinated updates.
- Recommended downstream skills:
  - `contract-change-check` if payloads change
  - `architecture-boundary-review` if responsibility shifts across desktop/backend

### Wave 6: Make durable summary maintenance incremental

**Goal**

- Prevent session-end persistence cost from growing with total chat length.

**Scope**

- `apps/api/src/chat-memory/chat-memory.service.ts`
- `apps/api/src/chat-memory/chat-memory.repository.ts`
- `apps/api/src/chat-memory/chat-summary.ts`

**Expected impact**

- Medium improvement for long chats and lower DB transaction time at session end.

**Implementation notes**

- Prefer recent-window or incremental summary inputs.
- Keep controller thin and preserve current transactional correctness requirements.

**Risks / dependencies**

- Summary correctness and ordering invariants must be preserved.
- Recommended downstream skills:
  - `tdd-implementer`

## Recommended execution order

1. **Wave 1**: unblock first paint.
2. **Wave 2**: stop publishing non-essential diagnostics at live-session frequency.
3. **Wave 3**: narrow conversation subscriptions and reduce timeline churn.
4. **Wave 4**: move microphone PCM work off the renderer main thread.
5. **Wave 5**: trim chat-memory round-trips and unbounded hydration work.
6. **Wave 6**: make durable summary maintenance incremental.

## Measurement gaps to close before implementation

- Add renderer startup milestones for:
  - shell mounted,
  - settings hydrated,
  - device list ready,
  - chat hydrated,
  - screen sources ready.
- Add timing around:
  - screen-frame encode duration,
  - screen-frame send duration,
  - microphone chunk processing duration,
  - IPC latency for high-value desktop calls.
- Re-profile after each remediation wave instead of stacking changes blindly.
- Use the existing debug panel and API metrics stack as the primary surfaces; extend them rather than creating parallel tooling.
