## Wave 2 Implementation Note

- `End speech mode` now routes through a dedicated speech-only teardown path: `useSessionRuntime.handleEndSpeechMode()` -> `DesktopSessionController.endSpeechMode()` -> `endSpeechModeInternal()`.
- That path still stops live speech runtime activity such as transport, capture, playback, screen context, transcript scratch state, and speech lifecycle state.
- Full conversation reset remains on `DesktopSessionController.endSession()`, which still uses the full runtime reset path and clears `conversationTurns`.
- Speech teardown preserves `conversationTurns` by passing `preserveConversationTurns: true` through `sessionControllerTeardown.ts` into the text runtime reset.
- Text follow-up after speech end now preserves prior turns again during text bootstrap in `sessionControllerLifecycle.ts`.

## Next Wave Risk

- Mixed-mode assistant ordering is still decided by the voice transcript path, not by the typed turn that triggered it.
- The next fix should start at `apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.ts`, where assistant transcript/update/finalize calls still target the generic current voice assistant turn.
- The data-model seam that likely needs to change is `apps/desktop/src/renderer/runtime/conversation/conversationTurnManager.ts`, especially `upsertCurrentVoiceAssistantTurn()` and the generic `currentVoiceAssistantTurnId` tracking used by later transcript events.
