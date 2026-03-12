# Voice Chat Single-Surface UX Spec

**Status:** Wave 1 foundation
**Last updated:** 2026-03-12

## Goal

Define the target contract for the voice-chat UX refactor while freezing the current production behavior with tests. This wave does **not** move voice transcripts into chat bubbles yet.

## Current Behavior Audit

### Current end-to-end transcript flow

1. Live speech transcript events enter through the voice transport and are routed by `transportEventRouter`.
2. `input-transcript` updates `currentVoiceTranscript.user` through `voiceTranscriptController`.
3. `output-transcript` updates `currentVoiceTranscript.assistant` through `voiceTranscriptController`.
4. `currentVoiceTranscript` is stored in [`apps/desktop/src/renderer/store/sessionStore.ts`](/home/rafa/dev/Livepair/main/apps/desktop/src/renderer/store/sessionStore.ts).
5. The top transcript panel reads `currentVoiceTranscript` through [`AssistantPanelSpeechTranscript.tsx`](/home/rafa/dev/Livepair/main/apps/desktop/src/renderer/components/features/AssistantPanelSpeechTranscript.tsx).
6. The bottom conversation surface reads only `conversationTurns` through [`AssistantPanelChatView.tsx`](/home/rafa/dev/Livepair/main/apps/desktop/src/renderer/components/features/AssistantPanelChatView.tsx) and [`AssistantPanelConversationSection.tsx`](/home/rafa/dev/Livepair/main/apps/desktop/src/renderer/components/features/AssistantPanelConversationSection.tsx).
7. Durable assistant history is appended only when `transportEventRouter` calls `promoteAssistantTranscriptTurn(...)`, which consumes the latest assistant transcript and appends a completed assistant turn via `textChatCtrl.appendCompletedAssistantTurn(...)`.

### What is stored where today

- User speech transcript:
  stored only in `currentVoiceTranscript.user`
- Assistant speech transcript while speaking:
  stored only in `currentVoiceTranscript.assistant`
- Assistant speech transcript after finalization:
  remains in `currentVoiceTranscript.assistant` until the next spoken user turn or teardown, and is also appended to `conversationTurns`
- User speech after finalization:
  remains only in `currentVoiceTranscript.user`; it is not promoted into `conversationTurns`

### Promotion timing today

- Assistant speech is promoted into `conversationTurns` on `turn-complete`.
- Assistant speech is also promoted on `interrupted`, using the latest transcript snapshot and an `Interrupted` status label.
- Promotion is idempotent for a turn. If `interrupted` is followed by `turn-complete`, the assistant turn is not appended twice.

### Why the top transcript panel and bottom chat both exist today

- `conversationTurns` supports durable conversation history and text-mode streaming turns.
- `currentVoiceTranscript` is a separate ephemeral speech-turn buffer with independent user and assistant slots.
- The conversation list has no concept of an in-progress speech bubble backed by `currentVoiceTranscript`.
- Because user speech is never promoted into `conversationTurns`, the top transcript panel is currently the only visible surface for live spoken user input.

### Interruption and turn completion behavior today

- `turn-complete` marks the voice turn completed, may promote the assistant transcript, and leaves `currentVoiceTranscript` populated.
- `interrupted` also marks the voice turn completed, promotes the latest assistant transcript if present, and leaves `currentVoiceTranscript` populated.
- The next spoken user transcript after a completed/interrupted turn clears the old `currentVoiceTranscript` buffer first, then starts the new speech turn.
- Session teardown clears `currentVoiceTranscript`.

## Target Behavior

### Product contract

Voice chat should eventually render through one visible conversation surface.

- Spoken user input becomes a right-aligned in-progress chat bubble.
- Assistant speech output becomes a left-aligned in-progress chat bubble.
- The separate top transcript panel will be removed in a later wave after the state contract is unified.

### Partial vs final transcript behavior

- Partial spoken-user transcript updates must revise the same in-progress user bubble.
- Final spoken-user transcript updates must finalize the text content for that user bubble, but finalization of the overall turn remains distinct from transcript finality.
- Partial assistant transcript updates must revise the same in-progress assistant bubble.
- Corrective assistant transcript updates must replace or normalize the existing in-progress assistant bubble content rather than append stale text blindly.

### Interruption behavior

- If assistant output is interrupted, the current assistant bubble must finalize with the latest known assistant transcript text.
- An interrupted assistant bubble should stay visible in the unified conversation surface with an interrupted status treatment.
- Interruption must not create a duplicate finalized assistant bubble if a later completion signal arrives for the same turn.

### Turn-finalization behavior

- Turn completion finalizes any promotable in-progress assistant bubble into durable conversation history.
- Turn completion must not create a durable user bubble from a second source of truth. The same bubble instance should progress from in-progress to finalized.
- Starting the next spoken user turn clears only the prior turn's ephemeral ownership, not the finalized conversation history.

## Ownership Rules For The Target UX

### User bubble

- Create:
  the speech transcript runtime creates the in-progress user bubble when the first user transcript for a new turn arrives
- Update:
  speech transcript updates revise that same bubble as more user transcript arrives
- Finalize:
  the turn orchestration layer marks the user bubble finalized when the turn is considered settled under the unified contract
- Clear:
  only ephemeral turn state for the active user bubble is cleared when a new turn starts or the session tears down

### Assistant bubble

- Create:
  the speech transcript runtime creates the in-progress assistant bubble when assistant transcript or assistant output begins
- Update:
  assistant transcript updates revise that same bubble
- Finalize:
  turn completion or interruption finalizes the assistant bubble once
- Clear:
  only ephemeral assistant-turn bookkeeping is cleared after finalization or teardown; finalized conversation history remains

### Boundary rule

- There must be one chat-surface state contract for visible voice turns.
- A later wave may still keep internal helper state, but visible voice-turn rendering cannot remain split across `currentVoiceTranscript` and `conversationTurns`.

## Risks And Ordering Hazards

- Transcript providers can send corrective updates that replace prior partial text rather than extend it.
- `interrupted` and `turn-complete` can arrive in close succession, so promotion/finalization must be idempotent.
- Assistant audio start and assistant transcript arrival are not the same event; bubble creation cannot assume transcript text exists at the first audio chunk.
- User transcript finality and overall turn completion are not the same milestone; collapsing them too early would regress interruption and late assistant-output behavior.
- During migration, dual-writing to both `currentVoiceTranscript` and `conversationTurns` would be the highest regression risk unless ownership is explicit.

## Wave 1 Safety Net

Wave 1 locks the current split behavior with focused tests:

- `currentVoiceTranscript` remains the source of truth for live spoken user and assistant transcript text
- `conversationTurns` receives only promoted assistant voice output today
- assistant promotion happens on `turn-complete`
- interrupted assistant output promotes once and does not duplicate on a later `turn-complete`
- transcript buffers remain populated after finalization and clear on the next spoken user turn or teardown

## Execution Note For Later Waves

- Wave 2 should first introduce a single visible voice-turn state contract and move creation/update/finalization responsibilities behind that seam before removing any UI.
- Highest-conflict single-lane files:
  `apps/desktop/src/renderer/store/sessionStore.ts`, `apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.ts`, `apps/desktop/src/renderer/runtime/sessionController.ts`, `apps/desktop/src/renderer/components/features/AssistantPanelChatView.tsx`, and `apps/desktop/src/renderer/components/features/AssistantPanelConversationSection.tsx`
- Work that can become parallel only after the state contract is unified:
  bubble presentation polish, top-transcript removal, conversation-list rendering cleanup, and non-runtime accessibility/styling follow-ups
