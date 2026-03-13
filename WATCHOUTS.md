
# MVP Development Watchouts

> **Status:** This document is aspirational design guidance, not a current-state description. Some items describe goals or constraints that are not yet fully implemented. Specifically: checkpoint saving (item 2) and the backend tool endpoints (item 8) are planned but not implemented yet. For the current implementation state, see [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) and [docs/KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md).

## 1. Latency
- Keep the hot path short: client → Gemini Live API.
- Use small audio chunks.
- Keep screen capture low frequency.
- Prefer short responses in Fast mode.
- Measure end-to-end latency from day one.

## 2. Long sessions
- Assume the technical session will reconnect.
- Enable session resumption.
- Enable context compression.
- Save short checkpoints periodically.

## 3. Context growth
- Do not keep raw full history.
- Store only: current goal, short recent turns, compressed summary, last relevant visual context.
- If visual context persists, keep it as one compact text summary rather than raw frames, screenshots, or stream payloads.
- Compress context on a schedule, not only on failure.

## 4. Screen capture cost
- Start at 0.5–1 FPS.
- Use JPEG compression.
- Reduce resolution.
- Increase FPS only temporarily when needed.
- Use HD screenshot only on demand.

## 5. Voice interruption
- Use local VAD.
- Stop agent audio immediately when the user starts speaking.
- Do not rely only on the model to detect interruption.

## 6. Electron security
- Keep `contextIsolation: true`.
- Keep `nodeIntegration: false`.
- Expose native features only through preload.
- Renderer must not access privileged APIs directly.
- Add CSP early.

## 7. Auth and tokens
- Never ship a real API key in the client.
- Use ephemeral tokens.
- Treat token renewal as a normal flow.
- Handle token expiration explicitly.

## 8. Tooling scope
- Keep MVP tools minimal.
- Approved (planned, not yet implemented) tool endpoints:
  - `screenshot-hd`
  - `visual-summary`
  - `session-checkpoint`
- Any new tool must justify demo value.

## 9. Preview API risk
- Isolate Gemini integration in one module.
- Do not spread API-specific logic across the app.
- Pin library versions.
- Recheck docs before changing integration behavior.

## 10. Demo scope
- Choose one main demo scenario.
- Treat other scenarios as secondary.
- Do not optimize for three demos at once.
- Prioritize polish over breadth.
