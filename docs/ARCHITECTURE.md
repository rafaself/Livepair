# Architecture

**Last updated:** 2026-03-11

This document describes the current repository state. For milestone-by-milestone status, see [docs/MILESTONE_MATRIX.md](./MILESTONE_MATRIX.md).

## Status Legend

- `Implemented`: present in the current repository
- `Partial`: present in part, but significant follow-up remains
- `Planned`: not implemented yet

## 1. Product Model

User-facing product modes:

- `text`
- `speech`

Internal runtime terminology:

- `voice` is the transport/session term used for the Gemini Live speech-mode path
- `currentMode` is the product-level source of truth for `text` vs `speech`
- `speechLifecycle` is the product-level source of truth for speech-session state once speech mode is active

Current behavior:

- `text` mode is backend-mediated through `POST /session/chat` and Gemini text models.
- `speech` mode requests an ephemeral token from `POST /session/token`, then connects directly from the desktop to Gemini Live.
- Typed input remains usable while speech mode is active, but it travels over the active Live session rather than the backend text endpoint.

## 2. Current Implementation Snapshot

Implemented:

- Electron overlay shell and React renderer
- Typed preload bridge and strict IPC boundary
- Desktop settings persistence and overlay interaction behavior
- `GET /health`
- `POST /session/token` with real Gemini Live ephemeral token issuance
- `POST /session/chat` with backend-mediated NDJSON text streaming
- Desktop session controller coordinating text and speech lifecycles
- SDK-backed Gemini Live transport adapter
- Local microphone capture pipeline and assistant audio playback
- Local interruption/barge-in behavior with playback stop and recovery
- Input/output transcript handling and transcript state wiring
- Manual screen-context capture with frame upload through the Live transport
- Session resumption and token refresh handling for speech mode
- S1 complete: mode exclusivity lock
- S4 complete: speech lifecycle lock

Partial:

- Screen context is implemented only as manual start/stop capture during an active speech session
- Operational hardening exists for token refresh, session resumption, and degraded-state handling, but backend error reporting is not implemented
- Voice-mode tool handling exists only for narrow local inspection tools

Planned:

- Backend checkpoint persistence and restore flow
- Backend-backed tool endpoints
- Backend error-report endpoint
- Adaptive screen-context policy, guardrails, and HD screenshot flow

## 3. System Context

Actors and systems:

- User
- Desktop client
- Backend API
- Gemini text model path
- Gemini Live API
- Redis session store (`Planned`)

High-level interaction paths:

- `text` mode: User -> Desktop client -> Backend API (`POST /session/chat`) -> Gemini text model
- `speech` mode: User -> Desktop client -> Backend API (`POST /session/token`) -> Desktop client -> Gemini Live API

Important boundary:

- The backend stays out of the audio/video hot path.
- The backend is not token-only anymore because it also mediates text-mode chat.

## 4. Component Responsibilities

### Desktop Client

Implemented:

- Render the assistant UI
- Hold product state and runtime diagnostics
- Start and end `text` and `speech` sessions
- Capture microphone audio for speech mode
- Play assistant audio for speech mode
- Detect interruption locally
- Send manual screen frames during an active speech session
- Execute narrow local voice tools

Planned:

- Broader backend-backed tool execution
- Checkpoint save/restore integration
- Adaptive screen capture policy

### Backend API

Implemented:

- Health endpoint
- Gemini Live ephemeral token issuance
- Backend-mediated text chat streaming

Planned:

- Session checkpoint persistence
- Backend-backed tool endpoints
- Error-reporting endpoint

### External Services

Implemented:

- Gemini Live API for speech mode
- Gemini text models for text mode

Planned:

- Redis-backed checkpoint/session store

## 5. Runtime Flows

### Text Mode

1. The desktop starts a request to `POST /session/chat`.
2. The backend forwards the request to the configured Gemini text model.
3. The backend streams NDJSON events back to the desktop.
4. The desktop updates conversation state and text-session lifecycle.

### Speech Mode

1. The desktop requests an ephemeral token from `POST /session/token`.
2. The backend returns a short-lived Gemini Live token.
3. The desktop opens a Gemini Live session directly.
4. The desktop streams microphone audio.
5. The desktop can optionally stream manual screen frames.
6. The model returns assistant audio, transcript events, tool requests, and connection events.
7. Local interruption handling stops playback and returns the speech lifecycle toward listening/recovery.

### Screen Context

Implemented:

- Manual start/stop only
- Active speech session required
- Lightweight JPEG frames at conservative settings

Planned:

- Adaptive capture boosts
- Additional guardrails and tuning
- HD screenshot tool path if needed

### Tool Invocation

Implemented:

- Gemini tool requests can be handled locally in speech mode for a narrow inspection-only tool set

Planned:

- `model -> desktop -> backend endpoint -> response` for backend-backed tools such as screenshot capture

### Recovery

Implemented:

- Speech-mode resumption uses the latest Gemini Live resumption handle when available
- The desktop refreshes the token before resuming if the current token is near expiry
- Explicit failure paths return the app to safe `text`/`off` states

Planned:

- Backend checkpoint save/load
- Context reconstruction from persisted session state

## 6. Interface Boundaries

### Backend Endpoints

Implemented:

- `GET /health`
- `POST /session/token`
- `POST /session/chat`

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
- text-session lifecycle
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
