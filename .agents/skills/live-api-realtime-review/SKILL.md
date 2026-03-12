---
name: live-api-realtime-review
description: Reviews Livepair's realtime and control-plane boundaries, distinguishing the current stub token flow from the planned Gemini Live API pipeline and flagging latency or architecture regressions. Use when touching session token issuance, audio capture, screen capture, playback, interruption, backend calls near the realtime hot path, or any Gemini transport or session code.
---

# Live API Realtime Review

## Use when changes touch
- session token issuance or renewal
- backend calls that could land on the realtime hot path
- planned or actual Gemini transport/session code
- screen capture, audio capture, playback, interruption, or checkpoint logic
- architecture changes that might proxy media through the backend

## Do not use when
- The change is isolated to static UI styling
- The change is backend-only and clearly unrelated to session, token, tool, or realtime boundaries

## Current repository reality

- Implemented today: desktop requests a stub token from the backend through `window.bridge` and main-process IPC.
- Planned target: desktop connects directly to Gemini Live API for realtime media; audio, vision, interrupt, reconnect, and checkpoint pipelines are not fully implemented yet.

Do not review planned subsystems as if they already exist. Check code first.

## Inspection steps

1. Confirm whether the changed behavior is implemented today or only documented in:
   - `README.md`
   - `docs/ARCHITECTURE.md`
   - `WATCHOUTS.md`
2. Inspect the existing token/control-plane path when relevant:
   - `apps/desktop/src/renderer/api/backend.ts`
   - `apps/desktop/src/preload/preload.ts`
   - `apps/desktop/src/main/ipc/registerIpcHandlers.ts`
   - `apps/desktop/src/main/backend/backendClient.ts`
   - `apps/api/src/session/**`
   - `packages/shared-types/src/index.ts`
3. Reject architecture regressions:
   - backend inserted into audio/video/frame hot path
   - extra round trips before starting or resuming a session
   - large synchronous work in capture/playback/session code
4. Compare against `WATCHOUTS.md`:
   - small audio chunks
   - lightweight screen capture
   - local interruption handling
   - explicit token expiry/renewal handling
   - resumability and short checkpoints
5. If the repo does not yet contain the subsystem being reviewed, state that you cannot verify latency or behavior from implementation and fall back to boundary checks only.

## Output format

```md
## Realtime Review

**Implemented path reviewed:**
- <current code path or "No implemented path for this subsystem">

**Latency risks:**
- <risk or "None">

**Architecture risks:**
- <risk or "None">

**Correctness/UX risks:**
- <risk or "None">

**Cannot verify from current context:**
- <item or "None">

**Recommended fixes:**
- <fix or "None">
```
