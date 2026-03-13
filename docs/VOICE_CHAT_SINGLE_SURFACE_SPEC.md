# Voice Chat Single-Surface Spec

**Status:** Shipped
**Last updated:** 2026-03-13

## Goal

Document the current shipped speech-chat architecture. This file describes the current repository behavior, not the intermediate migration plan.

## Final UX Contract

- Speech mode renders through one primary visible conversation surface.
- Spoken user turns appear as right-aligned voice-sourced chat bubbles in the same conversation list used by text mode.
- Assistant speech appears as a single left-aligned voice-sourced bubble that is updated in place while transcript and audio events stream in.
- The UI does not render a separate top transcript panel in the normal chat flow.

Primary surface:

- [`apps/desktop/src/renderer/components/features/AssistantPanelChatView.tsx`](../apps/desktop/src/renderer/components/features/AssistantPanelChatView.tsx)
- [`apps/desktop/src/renderer/components/features/AssistantPanelConversationSection.tsx`](../apps/desktop/src/renderer/components/features/AssistantPanelConversationSection.tsx)

Visible state source of truth:

- `conversationTurns` in [`apps/desktop/src/renderer/store/sessionStore.ts`](../apps/desktop/src/renderer/store/sessionStore.ts)

Compatibility-only mirror:

- `currentVoiceTranscript` in [`apps/desktop/src/renderer/store/sessionStore.ts`](../apps/desktop/src/renderer/store/sessionStore.ts)
- This mirror is retained for runtime compatibility and targeted tests, but it is not a primary rendered speech surface.

## Runtime Ownership Model

### Spoken user turns

- Create:
  the first `input-transcript` event for a speech turn creates the in-progress user bubble through [`apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.ts`](../apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.ts)
- Update:
  later user transcript updates revise the same bubble in place through [`apps/desktop/src/renderer/runtime/conversation/conversationTurnManager.ts`](../apps/desktop/src/renderer/runtime/conversation/conversationTurnManager.ts)
- Finalize:
  `turn-complete` finalizes the existing user bubble when the user side of the turn settles
- Carry-over rule:
  corrective transcript updates may continue to revise the same settled user bubble only when they are clearly the same utterance
- New-turn rule:
  the next distinct spoken user utterance starts a fresh streaming bubble even if the previous settled turn was assistant-only

### Assistant turns

- Create:
  assistant output creates a bubble on the first `output-transcript` or `audio-chunk`
- Update:
  later transcript updates rewrite the same assistant bubble instead of appending additional bubbles
- Finalize:
  `turn-complete` or `interrupted` settles that same bubble once
- Empty placeholder cleanup:
  if assistant audio starts a placeholder bubble and interruption happens before transcript text arrives, the empty placeholder is removed

## Interruption And Finalization Rules

- Interruption finalizes the current assistant bubble with the latest known assistant transcript text.
- A later `turn-complete` for the same interrupted turn must not create a duplicate bubble or clear the `Interrupted` label.
- Session recovery must stop assistant playback promptly and move the speech lifecycle toward `recovering`, then back to `listening` when microphone streaming resumes.
- Finalization must leave no orphan partial voice turns in `conversationTurns`.
- Starting the next spoken user turn clears only active voice-turn ownership and the compatibility mirror; it does not remove finalized conversation history.

## Retained Non-Primary Surfaces

- Compatibility-only:
  `currentVoiceTranscript` remains in the store for runtime mirroring and regression coverage
- Debug-only transcript surface:
  none

## Verification Evidence In Repo

Focused regression coverage for the shipped contract lives in:

- [`apps/desktop/src/renderer/runtime/sessionController.transcript.test.ts`](../apps/desktop/src/renderer/runtime/sessionController.transcript.test.ts)
- [`apps/desktop/src/renderer/runtime/sessionController.interruption.test.ts`](../apps/desktop/src/renderer/runtime/sessionController.interruption.test.ts)
- [`apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.test.ts`](../apps/desktop/src/renderer/runtime/voice/voiceTranscriptController.test.ts)
- [`apps/desktop/src/renderer/runtime/transport/transportEventRouter.test.ts`](../apps/desktop/src/renderer/runtime/transport/transportEventRouter.test.ts)

The regression suite covers:

- single-surface visible rendering through `conversationTurns`
- spoken user turn persistence in chat history
- single-bubble assistant streaming and correction handling
- interruption finalization without duplicate assistant turns
- empty assistant placeholder cleanup on interruption
- fresh user-turn creation after assistant-only completed or interrupted turns
- transcript mirror reset on session end and next-turn rollover

## Manual QA Entry Point

Use the concise speech-chat checklist in [docs/QA_RUNBOOK.md](./QA_RUNBOOK.md) before demos or release sign-off.
