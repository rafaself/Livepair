# Implementation Roadmap

## Summary

This roadmap assumes the UI shell is mostly complete and the next work should focus on replacing mocks with a real, low-latency MVP runtime in small, PR-sized releases. The sequence stays aligned with the current architecture: desktop client connects directly to Gemini Live API, while the backend remains limited to token issuance, lightweight tools, checkpointing, and error reporting.

Suggested target path for the future document: `docs/IMPLEMENTATION_ROADMAP.md`.

## Performance Targets

- voice latency target: under 1 second for the main happy path
- typical audio chunk duration: 20-40 ms
- baseline screen capture FPS: 0.5-1 FPS

## Release 0: Runtime Infrastructure

**Purpose:** Prepare the desktop runtime layer for upcoming realtime features.

**Short description:** Add the base runtime scaffolding needed to support realtime work without yet connecting the full product flow.

**Suggested implementation approach:** Introduce a session controller scaffold, a transport adapter interface, a runtime state store, and lightweight logging hooks that can be reused by later releases.

**Expected outcome:** The desktop app has a clean runtime foundation for session lifecycle, transport integration, and observability.

**Definition of done:**
- a session controller scaffold exists in the desktop runtime layer
- a transport adapter interface is defined and ready for Gemini implementation
- runtime state is separated from mock UI-only state
- logging hooks exist for session and transport events

**Important notes / dependencies / risks:** Keep the abstractions small and focused on the documented MVP path.

---

## Release 1: Real Token Issuance

**Purpose:** Replace the stubbed backend auth flow with a real ephemeral token path.

**Short description:** The backend currently returns a placeholder token. This release makes `/session/token` production-real so the desktop can authenticate a real Gemini Live session.

**Suggested implementation approach:** Keep the existing endpoint shape and service boundary, replace the stub service logic with Gemini ephemeral token issuance, and update shared types so the response no longer advertises itself as stub-only.

**Expected outcome:** The desktop can request a usable short-lived token from the backend.

**Definition of done:**
- `/session/token` returns a real ephemeral token
- token expiry is mapped correctly
- backend tests cover success and failure cases
- shared contract is updated in the same task

**Important notes / dependencies / risks:** This is the main blocker for all realtime work. Do not put permanent credentials in the client.

---

## Release 2: Desktop Realtime Session Skeleton

**Purpose:** Introduce the real session controller and transport layer without yet tackling full AV complexity.

**Short description:** Replace the “request token then flip UI state” behavior with a real desktop session lifecycle: request token, connect, track connection state, surface failures.

**Suggested implementation approach:** Add a dedicated Gemini transport adapter and a session controller module in the desktop app. Keep model-specific logic isolated there and feed normalized runtime state into the existing UI.

**Expected outcome:** The app opens a real Live API session and the UI reflects actual connection state instead of mocked transitions.

**Definition of done:**
- the desktop can connect and disconnect cleanly
- session state is driven by runtime events
- mock session usage is removed from the main happy path
- renderer continues to access privileged behavior only through preload

**Important notes / dependencies / risks:** Keep the transport isolated in one module to limit preview API churn.

---

## Release 3: Text-First Realtime Turn

**Purpose:** Prove a real end-to-end interaction before adding audio and vision.

**Short description:** Add a minimal text/event loop so one real user input can produce one real model response through the new session controller.

**Suggested implementation approach:** Start with the smallest reliable loop: send text input, receive streamed text events, update transcript state, and surface recoverable errors.

**Expected outcome:** One real conversation turn works end to end using the new transport.

**Definition of done:**
- user input reaches the model through the real session
- streamed response text is rendered in the UI
- disconnect and token failure states are visible and recoverable
- a smoke test covers the session-state flow

**Important notes / dependencies / risks:** This keeps scope narrow and validates the architecture before media work.

---

## Release 4: Microphone Capture and Playback

**Purpose:** Add the first real voice interaction path.

**Short description:** Introduce microphone capture, chunked audio upload, and assistant audio playback so the app can support live spoken interaction.

**Suggested implementation approach:** Build a small audio pipeline around capture, encoding/chunking, output playback, and queue management. Keep the pipeline separate from the UI and driven by the session controller.

**Expected outcome:** The user can speak and hear model responses in a real session.

**Definition of done:**
- microphone input streams into the Live session
- response audio plays back reliably
- audio pipeline failures are handled without crashing the UI
- latency is measured for at least the happy path

**Important notes / dependencies / risks:** Follow the watchouts: small audio chunks, low latency, no backend proxying.

---

## Release 5: Local VAD and Interruption Handling

**Purpose:** Make voice interaction feel immediate instead of demo-fragile.

**Short description:** Add local speech detection so assistant playback stops as soon as the user starts speaking again.

**Suggested implementation approach:** Introduce local VAD in the desktop client, wire it to session interruption and playback cancellation, and keep the decision local rather than relying only on model-side behavior.

**Expected outcome:** Interruptions feel responsive and conversational.

**Definition of done:**
- user speech interrupts playback immediately
- playback queue is cleared correctly
- session returns to listening state after interruption
- tests cover the interruption state machine

**Important notes / dependencies / risks:** This is a first-class UX requirement for the MVP, not a polish item.

---

## Release 6: Session Checkpointing and Recovery

**Purpose:** Make sessions resilient enough for real demos and longer usage.

**Short description:** Add minimal checkpoint storage and restore so reconnects do not feel like full resets.

**Suggested implementation approach:** Keep the stored shape small: goal, recent turns, compressed summary, and last relevant visual context. Add backend endpoints and shared contracts only for that minimum.

**Expected outcome:** The app can recover essential session context after reconnect or restart.

**Definition of done:**
- checkpoints can be saved and loaded
- restore path rebuilds enough local state to resume usefully
- raw full history is not persisted by default
- shared contracts and backend tests are updated together

**Important notes / dependencies / risks:** Resist expanding this into long-term memory.

---

## Release 7: Lightweight Screen Streaming

**Purpose:** Add the multimodal context the product is built around.

**Short description:** Start streaming compressed screen frames to the model using conservative defaults.

**Suggested implementation approach:** Implement a vision pipeline with low FPS, reduced resolution, and JPEG compression. Add adaptive capture only as a controlled temporary boost when needed.

**Expected outcome:** The model receives ongoing screen context without blowing up latency or resource usage.

**Definition of done:**
- screen frames are captured and sent in the realtime session
- baseline capture stays lightweight
- frame rate and resolution are configurable through internal constants
- the system remains responsive during active capture

**Important notes / dependencies / risks:** Do not start with aggressive capture settings. Performance regressions here will undermine the rest of the MVP.

---

## Release 8: Error Reporting and Operational Hardening

**Purpose:** Make failures diagnosable before broader testing or demos.

**Short description:** Add a small error reporting path and tighten reconnect, expiry, and degraded-state behavior.

**Suggested implementation approach:** Introduce a minimal backend error endpoint, add structured client error events, and harden token renewal and reconnect handling around the session controller.

**Expected outcome:** Realtime failures are observable and the app behaves predictably under common failure conditions.

**Definition of done:**
- token expiry is treated as a normal flow
- reconnect behavior is explicit
- meaningful error reports reach the backend
- failure scenarios are covered by targeted tests

**Important notes / dependencies / risks:** Keep logging useful but lightweight.

---

## Release 9: One Demo-Critical Tool

**Purpose:** Add only the smallest tool surface needed for the chosen demo.

**Short description:** Implement a single tool such as `screenshot-hd` only if the main demo scenario truly needs it.

**Suggested implementation approach:** Prefer `screenshot-hd` first because it aligns with the existing docs and multimodal workflow. Keep the desktop bridge typed, the backend endpoint narrow, and the tool invocation path isolated. The execution path should remain `model -> desktop tool bridge -> backend endpoint -> response`.

**Expected outcome:** The assistant can request one targeted high-value tool during a real session.

**Definition of done:**
- one approved tool works end to end
- tool request and response are typed and tested
- no generic or overly broad privileged bridge is introduced
- demo scenario clearly benefits from the tool

**Important notes / dependencies / risks:** Do not add multiple tools at once. Tool scope should be justified by demo value.

---

## Release 10: Demo Readiness Pass

**Purpose:** Convert a technically working MVP into a reliable demo build.

**Short description:** Validate the main scenario, tighten UX rough edges, and confirm the app meets the documented MVP boundaries.

**Suggested implementation approach:** Test the happy path repeatedly, inspect logs and failure recovery, and remove any remaining mock-only or debug-only behavior from the main flow.

**Expected outcome:** One polished demo scenario works consistently.

**Definition of done:**
- the main demo scenario is repeatable
- failure handling is acceptable for demo use
- lint, typecheck, and relevant tests pass
- the app still respects Electron security and direct-to-Gemini architecture

**Important notes / dependencies / risks:** Choose one main demo and optimize for that before expanding breadth.

## Public Interfaces / Contract Changes Expected Across The Roadmap

- `CreateEphemeralTokenResponse` should evolve from stub-only to real token metadata
- new shared contracts will likely be needed for:
  - session connection/runtime state
  - checkpoint save/load payloads
  - error reporting payloads
  - one approved tool request/response
- privileged desktop capabilities must remain behind typed preload APIs only

## Test Plan

- API unit/integration tests for token issuance, checkpointing, and error reporting
- Desktop runtime tests for session state transitions, interruption handling, and reconnect logic
- Contract/type tests for shared payloads
- Small smoke tests for each release boundary:
  - token request works
  - session connects
  - one real turn completes
  - interruption works
  - screen context streams
  - checkpoint recovers
  - demo scenario succeeds

## Assumptions

- The existing UI shell is close enough that new work should prioritize runtime integration over more interface work
- The MVP remains “Fast mode first”; Thinking mode is deferred
- No new production dependencies are added without explicit approval
- Redis and extra tooling are introduced only when the relevant release is reached, not earlier
