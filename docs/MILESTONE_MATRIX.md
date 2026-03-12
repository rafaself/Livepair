# Milestone Matrix

**Last updated:** 2026-03-11

Status legend:

- `Implemented`: present in the current repository
- `Partial`: current repo contains part of the milestone, but meaningful follow-up remains
- `Planned`: not implemented yet

| Milestone | Status | Current repository state | Remaining gap |
| --- | --- | --- | --- |
| Release 0: Runtime Infrastructure | Implemented | Session controller, typed runtime state, transport abstractions, and logging hooks are present in the desktop runtime. | Keep stable; no foundational gap blocking current work. |
| Release 1: Real Token Issuance | Implemented | `POST /session/token` issues real Gemini Live ephemeral tokens. | Hardening only. |
| Release 2: Desktop Realtime Session Skeleton | Implemented | Desktop session controller and SDK-backed Gemini Live transport are in place. | Ongoing stabilization only. |
| Release 3: Text-First Realtime Turn | Implemented | `text` mode uses backend-mediated NDJSON streaming through `POST /session/chat`. | Error UX and demo polish remain outside the baseline milestone. |
| Release 4: Microphone Capture And Playback | Implemented | Local microphone capture, chunk upload, and assistant audio playback are present. | Further perf measurement and hardening remain. |
| Release 5: Local VAD And Interruption Handling | Implemented | Local interruption behavior, playback stop, and recovery flow are implemented and covered by targeted tests. | Continue regression coverage. |
| Release 6: Session Checkpointing And Recovery | Planned | No backend checkpoint endpoint, restore endpoint, or Redis-backed checkpoint store exists yet. | Implement shared contracts, backend persistence, and restore flow. |
| Release 7: Lightweight Screen Streaming | Partial | Manual screen capture start/stop and frame upload during an active speech session are implemented. | Adaptive capture policy, tuning, and guardrails are not implemented yet. |
| Release 8: Error Reporting And Operational Hardening | Partial | Token refresh, session resumption, and explicit degraded-state handling are implemented. | Backend error-report endpoint and broader operational diagnostics are still missing. |
| Release 9: One Demo-Critical Tool | Planned | No backend-backed tool endpoint exists yet. Current voice tools are limited to local inspection helpers. | Choose and implement one narrow tool path if the demo requires it. |
| Release 10: Demo Readiness Pass | Planned | The stabilization baseline exists, but the final demo-readiness pass is not complete. | Run focused UX, failure-recovery, and repeatability validation once remaining gaps are closed. |

## Product Model Alignment

- User-facing modes are `text` and `speech`.
- Runtime transport terminology uses `voice` for the Gemini Live speech-session path.
- `text` mode is backend-mediated.
- `speech` mode is direct desktop-to-Gemini Live after backend token issuance.
