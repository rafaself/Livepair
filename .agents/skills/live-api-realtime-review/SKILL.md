---
name: live-api-realtime-review
description: Review changes that affect realtime UX, latency, or the client-to-Gemini-Live-API hot path. Catches silent latency regressions, unnecessary backend proxying, and degraded interruption or resumability behavior.
---

# Live API Realtime Review

## Use when changes touch
- Audio capture or playback pipeline
- Audio chunking or encoding
- VAD or interruption handling
- Screen frame capture, compression, or transmission
- WebSocket or streaming connection to Gemini Live API
- Reconnect, session resume, or checkpointing logic
- Ephemeral token issuance or renewal flow
- Any backend interaction that could land on the realtime hot path

## Sequencing
- **Phase:** post-implementation review — runs after code is written.
- If the change also touches Electron security surface or shared contracts, run `electron-security-review` and/or `contract-change-check` in parallel.
- If `feature-planner` was run, this skill should have been listed in its "Required downstream skills" output.

## Do not use when
- Changes are backend-only with no realtime path impact
- Changes are purely UI layout or styling with no capture/playback involvement

## Checklist

1. **Hot path remains short** - Client still connects directly to Gemini Live API. No new backend hop inserted in the audio/video/screen path.
2. **No unnecessary backend proxying** - Data that should flow client-to-Gemini is not being routed through the backend.
3. **No silent latency regressions** - Check for:
   - Increased chunk sizes
   - Added synchronous waits or blocking calls in the capture/playback pipeline
   - New network round-trips on the hot path
   - Heavier compression or encoding without justification
4. **Screen capture remains lightweight** - Capture frequency not increased beyond baseline without measurement. Resolution and compression stay reasonable (per WATCHOUTS.md guidelines).
5. **Interruption is first-class** - Local VAD still triggers immediate audio stop. Model-side detection is not the sole interruption mechanism.
6. **Resumability intact** - Reconnection, checkpointing, and short-context recovery still function. Session state is not silently discarded.
7. **Token flow correct** - Ephemeral token issuance and renewal still work. Token expiration is handled explicitly, not silently ignored.

## Output format

```
## Realtime Review

**Latency risks:**
- <risk or "None">

**UX risks:**
- <risk or "None">

**Correctness risks:**
- <risk or "None">

**Recommended fixes:**
- <fix or "None">
```
