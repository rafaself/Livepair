# Architecture

**Last updated:** 2026-03-15

This document describes the current repository state. For milestone-by-milestone status, see [docs/MILESTONE_MATRIX.md](./MILESTONE_MATRIX.md).

## Status Legend

- `Implemented`: present in the current repository
- `Partial`: present in part, but significant follow-up remains
- `Planned`: not implemented yet

## 1. Product Model

User-facing product states:

- `inactive`
- `speech`

Internal runtime terminology:

- `voice` is the transport/session term used for the Gemini Live speech-mode path
- `text` is the Gemini Live session mode used for typed turns once a Live session is active
- `currentMode` is the product-level source of truth for `inactive` vs `speech`
- `speechLifecycle` is the product-level source of truth for speech-session state once speech mode is active

Current behavior:

- When no Live session is active, the desktop stays in an explicit inactive container state, keeps canonical chat history visible, and offers start/resume Live-session actions. Typed input is unavailable while inactive.
- `speech` mode requests an ephemeral token from `POST /session/token`, then connects directly from the desktop to Gemini Live.
- Typed input remains usable while speech mode is active, and it travels over the active Live session rather than a backend endpoint.
- Backend chat-memory endpoints now own durable chat state, and desktop chat IPC delegates to them while preserving the renderer-facing bridge contract.

## 2. Current Implementation Snapshot

Implemented:

- Electron overlay shell and React renderer
- Typed preload bridge and strict IPC boundary
- Desktop settings persistence and overlay interaction behavior
- Inactive conversation container with start/resume Live-session actions
- `GET /health`
- `POST /session/token` with real Gemini Live ephemeral token issuance
- Postgres-backed chat-memory REST endpoints for chats, messages, live sessions, and durable summaries
- Desktop chat-memory IPC delegation to backend-owned persistence for chats, messages, live sessions, and durable summaries
- No desktop-local durable chat-memory store in production
- Desktop session controller coordinating inactive and speech lifecycles
- Typed turns routed over the active Gemini Live session
- SDK-backed Gemini Live transport adapter
- Local microphone capture pipeline and assistant audio playback
- Local interruption/barge-in behavior with playback stop and recovery
- Input/output transcript handling and transcript state wiring
- Manual screen-context capture with frame upload through the Live transport
- Session resumption and token refresh handling for speech mode
- S1 complete: mode exclusivity lock
- S4 complete: speech lifecycle lock

Partial:

- Screen context is implemented only as manual start/stop capture during an active Live session
- Operational hardening exists for token refresh, session resumption, and degraded-state handling, but backend error reporting is not implemented
- Voice-mode tool handling exists only for narrow local inspection tools

Planned:

- Backend checkpoint persistence and restore flow
- Backend-backed tool endpoints
- Backend error-report endpoint
- Additional screen-context guardrails, tuning, and HD screenshot flow

## 3. System Context

Actors and systems:

- User
- Desktop client
- Backend API
- Gemini Live API
- Redis session store (`Planned`)

High-level interaction paths:

- inactive state: User -> Desktop client (history + start/resume Live-session actions)
- `speech` mode: User -> Desktop client -> Backend API (`GET /health`, `POST /session/token`) -> Desktop client -> Gemini Live API
- typed follow-up during speech: User -> Desktop client -> active Gemini Live session

Important boundary:

- The backend stays out of the audio/video hot path.
- The backend does not currently mediate typed chat turns.

## 4. Component Responsibilities

### Desktop Client

Implemented:

- Render the assistant UI
- Hold product state and runtime diagnostics
- Start and end Live sessions for speech mode while preserving inactive/history state
- Accept typed notes only while a Live session is active
- Capture microphone audio for speech mode
- Play assistant audio for speech mode
- Detect interruption locally
- Send manual screen frames during an active Live session
- Execute narrow local voice tools
- Internal Live transport adapter boundary under `apps/desktop/src/renderer/runtime/transport/` now owns provider connection lifecycle, provider connect/setup mapping, outbound transport payload mapping, inbound event normalization, transport termination classification, and session-resumption handle updates before the rest of the runtime sees them

Planned:

- Broader backend-backed tool execution
- Checkpoint save/restore integration
- Additional adaptive screen capture guardrails and HD screenshot flow

### Live Transport Boundary

Implemented:

- Session and supervisor code now create and coordinate Live transport through a small internal adapter contract instead of selecting the Gemini transport directly
- Inbound Gemini SDK/server messages are normalized to internal transport events before the session engine, supervisor, transcript, or tool logic handles them
- Outbound runtime requests are mapped at the transport boundary from internal request types (`text`, `audio-chunk`, `audio-stream-end`, `tool-responses`, `video-frame`) into Gemini transport payloads

Still outside the transport adapter:

- Session lifecycle rules and recovery policy owned by the session engine/supervisor
- Transcript ownership and turn assembly
- Local audio capture/playback behavior
- Screen-capture cadence and frame-production policy
- UI state and presentation logic

Deferred:

- Multi-runtime or multi-provider host abstractions
- Audio or screen adapter redesign
- Broad telemetry redesign

### Audio Adapter Boundary

Implemented:

- `apps/desktop/src/renderer/runtime/audio/` owns microphone capture startup/shutdown, browser media-device setup, Web Audio/worklet wiring, PCM chunk production, speech-activity detection integration, assistant playback routing, and audio-device/playback diagnostics
- Audio-originated callbacks are normalized at the audio boundary into small internal runtime events for capture chunks, capture activity, capture diagnostics/errors, and playback state/diagnostics/errors before voice/session orchestration consumes them
- Voice media modules under `runtime/voice/media/` translate those normalized audio events into existing store updates, transport sends, interruption recovery, and runtime error handling

Still outside the audio adapter:

- Session lifecycle rules and recovery policy owned by the session engine/supervisor
- Transport protocol handling and provider event normalization
- Screen capture behavior
- UI state and presentation logic

Deferred:

- Broader audio boundary consolidation across every runtime consumer
- Multi-runtime or non-Live audio abstractions
- Telemetry redesign beyond the existing audio diagnostics patches

### Backend API

Implemented:

- Health endpoint
- Gemini Live ephemeral token issuance
- Chat-memory persistence endpoints backed by Postgres and used by desktop persistence flows

Planned:

- Session checkpoint persistence
- Backend-backed tool endpoints
- Error-reporting endpoint

### External Services

Implemented:

- Gemini Live API for speech mode and in-session typed turns

Planned:

- Redis-backed checkpoint/session store

## 5. Runtime Flows

### Inactive State

1. No Live session is connected.
2. The desktop keeps canonical conversation history visible.
3. The primary UI action starts or resumes a Live session.
4. Typed submit remains unavailable until speech mode is active.

### Speech Mode

1. The desktop requests an ephemeral token from `POST /session/token`.
2. The backend returns a short-lived Gemini Live token.
3. The desktop opens a Gemini Live session directly.
4. The desktop can start microphone audio independently on the active Live session.
5. The desktop can optionally start manual screen frames on the same Live session.
6. The model returns assistant audio, transcript events, tool requests, and connection events.
7. Local interruption handling stops playback and returns the speech lifecycle toward listening/recovery.

### Typed Input During Speech Mode

1. The user types into the composer while speech mode is active.
2. The desktop routes the turn over the active Gemini Live session in text mode.
3. The shared conversation timeline updates in place on the same surface as speech turns.

### Screen Context

Implemented:

- Active Live session required
- First use of Share Screen requires choosing a persisted `screenContextMode` of `manual` or `continuous`
- Manual mode keeps Share Screen start/stop explicit and sends only when the user clicks the manual send control
- Manual sends always use high-detail capture settings
- Continuous mode keeps explicit Share Screen start/stop, then sends on a fixed 3000 ms base cadence with temporary 1000 ms bursts after meaningful thumbnail changes
- Continuous mode uses `continuousScreenQuality` as its baseline quality, with `medium` as the default
- Lightweight JPEG frames use conservative sizing/backpressure and latest-frame-wins while an earlier send is still in flight
- Debug frame dumps are written only for actual outbound sends and named by timestamp, mode, quality, and send reason
- Voice-mode screen sharing uses `MEDIA_RESOLUTION_LOW` by default unless the desktop env overrides it
- Runtime replacement during reconnect/resume/fallback always stops screen capture; users must manually re-enable it on the replacement Live runtime
- Durable multimodal carry-over is limited to an optional compact text-only `screenContextSummary` entry in the existing rehydration context snapshot; raw screen media and live screen state remain ephemeral
- `apps/desktop/src/renderer/runtime/screen/` now owns the internal Live-runtime screen adapter boundary for capture lifecycle, masked/analyzed frame availability, manual/continuous send policy, latest-frame buffering, normalized outbound frame requests, and screen-specific failure classification before session runtime code consumes those signals
- Session runtime and supervisor code now consume narrow internal screen contracts split between capture controls and runtime coordination instead of depending directly on screen send-chain details

Planned:

- Additional guardrails and tuning
- HD screenshot tool path if needed
- Broader screen-settings/UI restructuring remains outside the current screen adapter work

### Tool Invocation

Implemented:

- Gemini tool requests can be handled locally in speech mode for a narrow inspection-only tool set

Planned:

- `model -> desktop -> backend endpoint -> response` for backend-backed tools such as screenshot capture

### Recovery

Implemented:

- Speech-mode resumption uses the latest Gemini Live resumption handle when available
- The desktop refreshes the token before resuming if the current token is near expiry
- Explicit failure paths return the app to safe `inactive`/`off` states

Planned:

- Backend checkpoint save/load
- Context reconstruction from persisted session state

## 6. Interface Boundaries

### Backend Endpoints

Implemented:

- `GET /health`
- `POST /session/token`
- `GET /chat-memory/chats/current`
- `PUT /chat-memory/chats/current`
- `POST /chat-memory/chats`
- `GET /chat-memory/chats`
- `GET /chat-memory/chats/:chatId`
- `GET /chat-memory/chats/:chatId/messages`
- `POST /chat-memory/chats/:chatId/messages`
- `GET /chat-memory/chats/:chatId/summary`
- `GET /chat-memory/chats/:chatId/live-sessions`
- `POST /chat-memory/chats/:chatId/live-sessions`
- `PATCH /chat-memory/live-sessions/:id/resumption`
- `PATCH /chat-memory/live-sessions/:id/snapshot`
- `POST /chat-memory/live-sessions/:id/end`

Planned:

- `POST /session/checkpoint`
- `POST /tool/screenshot-hd`
- `POST /tool/visual-summary`
- `POST /session/error`

### Desktop Security Boundary

Implemented:

- Typed preload bridge
- Strict IPC validation
- `contextIsolation: true`
- `nodeIntegration: false`

Constraint:

- Any new privileged capability must stay behind preload plus typed contracts.

### Shared Contracts

Implemented:

- API payloads and shared types live in `packages/shared-types`

Planned:

- Checkpoint payloads
- Backend tool request/response payloads
- Error-report payloads

## 7. Data And State

Current desktop runtime state includes:

- conversation turns
- typed-input lifecycle (`textSessionLifecycle`)
- `currentMode`
- `speechLifecycle`
- transport and backend status
- voice capture/playback diagnostics
- screen capture diagnostics
- speech-session resumption handles and token-expiry metadata

Planned persisted checkpoint shape:

- `session_id`
- `goal`
- `summary`
- `recent_turns`
- `last_visual_context`

## 8. Constraints And Non-Goals

- No backend proxy for audio/video streaming
- No permanent Gemini API key in the desktop client
- No duplicated API or IPC contract definitions across packages
- No long-term memory system in the current MVP path
- Do not describe adaptive capture, backend tools, checkpoint persistence, or backend error reporting as implemented until the endpoints and contracts exist

## 9. Supporting Diagrams

See [docs/FLOW.md](./FLOW.md) for the Mermaid diagram index. The diagrams are maintained to reflect current behavior, with planned-only elements labeled explicitly.
