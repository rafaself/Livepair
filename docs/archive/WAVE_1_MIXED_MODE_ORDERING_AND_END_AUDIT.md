# Wave 1 Audit: Mixed-Mode Ordering And Speech-End Semantics

Date: 2026-03-12

## Scope

This note records the current ordering and teardown behavior before the production bugfix waves land.

## Confirmed ordering path

Typed message while speech mode is active:

1. `apps/desktop/src/renderer/components/features/useAssistantPanelController.ts`
   `handleSubmitTextTurn`
2. `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
   `handleSubmitTextTurn`
3. `apps/desktop/src/renderer/runtime/sessionControllerPublicApi.ts`
   `submitTextTurn`
4. If `speechLifecycle` is active:
   - `textChatCtrl.appendUserTurn(trimmedText)`
   - `activeTransport.sendText(trimmedText)`

Assistant speech output promotion/finalization:

1. `apps/desktop/src/renderer/runtime/transport/transportEventRouter.ts`
   - `output-transcript` -> `ensureAssistantVoiceTurn()` -> `applyVoiceTranscriptUpdate('assistant', ...)`
   - `audio-chunk` -> `ensureAssistantVoiceTurn()`
   - `turn-complete` -> `finalizeCurrentVoiceTurns('completed')`
2. `apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.ts`
   - `ensureAssistantTurn`
   - `applyTranscriptUpdate`
   - `finalizeCurrentVoiceTurns`
3. `apps/desktop/src/renderer/runtime/conversation/conversationTurnManager.ts`
   - `upsertCurrentVoiceAssistantTurn`
   - `finalizeCurrentVoiceAssistantTurn`

Current decision point for ordering:

- Ordering is decided at append/upsert time in `conversationTurnManager.ts`, because turns are placed directly into `sessionStore.conversationTurns` in insertion order.
- Assistant completion is not linked to a specific triggering typed user turn.
- The active assistant voice turn is tracked generically through `currentVoiceAssistantTurnId`, so later assistant transcript/finalization can reuse or overwrite an earlier assistant turn instead of appending below the typed user turn that triggered it.

## Confirmed `End speech mode` path

UI to runtime path:

1. `apps/desktop/src/renderer/components/features/useAssistantPanelController.ts`
   `handleEndSpeechMode`
2. `apps/desktop/src/renderer/runtime/useSessionRuntime.ts`
   `handleEndSession`
3. `apps/desktop/src/renderer/runtime/sessionControllerPublicApi.ts`
   `endSession`
4. `apps/desktop/src/renderer/runtime/sessionController.ts`
   `endSessionInternal`
5. `apps/desktop/src/renderer/runtime/sessionControllerTeardown.ts`
   `teardownActiveRuntime`
6. `apps/desktop/src/renderer/runtime/sessionControllerRuntime.ts`
   `resetRuntimeState`
7. `apps/desktop/src/renderer/runtime/text/textChatController.ts`
   `resetRuntime`
8. `apps/desktop/src/renderer/store/sessionStore.ts`
   `resetTextSessionRuntime`

Exact history-clearing point:

- `sessionStore.resetTextSessionRuntime()` sets `conversationTurns: []`.
- `End speech mode` is therefore currently mapped to the full session reset path instead of a speech-only teardown path.

## Bugfix invariants locked by this wave

1. A typed user turn must always appear before the assistant turn it triggered.
2. Ending speech mode must not clear conversation history.
3. Ending speech mode must still allow continued text chat.
4. Conversation reset and speech-session teardown must be separate actions.

## Root-cause map for next waves

Wave 2: `End` semantics

- Introduce a speech-only shutdown path that tears down voice transport/capture/playback and exits product mode back to `text` without calling the full conversation reset path.
- Keep full session/chat reset as a separate explicit action.
- Highest-conflict files for this wave:
  - `apps/desktop/src/renderer/runtime/sessionController.ts`
  - `apps/desktop/src/renderer/runtime/sessionControllerPublicApi.ts`
  - `apps/desktop/src/renderer/runtime/sessionControllerTeardown.ts`
  - `apps/desktop/src/renderer/store/sessionStore.ts`

Wave 3: mixed-mode ordering

- Link assistant completion/finalization to the triggering typed turn instead of the generic current assistant voice turn.
- Prevent later assistant transcript events from mutating a previously completed assistant turn that sits above a newly appended typed user turn.
- Highest-conflict files for this wave:
  - `apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.ts`
  - `apps/desktop/src/renderer/runtime/conversation/conversationTurnManager.ts`
  - `apps/desktop/src/renderer/runtime/transport/transportEventRouter.ts`
  - `apps/desktop/src/renderer/runtime/sessionControllerPublicApi.ts`
  - `apps/desktop/src/renderer/runtime/sessionController.ts`
