# apps/desktop/src/renderer/runtime/voice AGENTS.md

## Scope
This file applies to `apps/desktop/src/renderer/runtime/voice/`.

## Local structure
- `media/` owns capture/playback bridging and transport-adjacent audio chunk dispatch.
- `session/` owns token, fallback, interruption, and resume coordination.
- Keep `media/voiceChunkPipeline.ts` and `session/voiceResumeController.ts` as thin composition entrypoints; extract new helpers beside them by responsibility instead of pushing more logic into assembly modules.

## Maintenance rules
- Do not move session/store synchronization down into `runtime/audio/`, and do not move raw transport-resume logic into transcript or tools modules.
- Preserve current dispatch and resume sequencing when refactoring helpers; treat ordering changes as behavior changes that require focused runtime tests.
