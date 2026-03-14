# apps/desktop/src/renderer/runtime/audio AGENTS.md

## Scope
This file applies to `apps/desktop/src/renderer/runtime/audio/`.

## Local structure
- Keep `localVoiceCapture.ts` and `assistantAudioPlayback.ts` as the stable composition entrypoints consumed by the wider runtime.
- Place capture lifecycle helpers in `localVoiceCapture*` siblings and playback routing/decoding helpers in `assistantAudioPlayback*` siblings so browser device logic stays easy to trace.
- Keep `audioProcessing.ts` and `speechActivityDetector.ts` focused on signal-processing concerns; store/session synchronization belongs in voice-layer controllers, not here.

## Maintenance rules
- Preserve the current PCM contracts: capture emits mono `pcm_s16le` 16 kHz 20 ms chunks, and assistant playback consumes PCM16LE chunks.
- Keep Web Audio and media-device dependencies injectable so the existing Vitest harnesses remain the first line of regression coverage.
