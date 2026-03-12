## Wave 4 Completion Note

The speech/text coexistence fixes are now closed with the following runtime invariants:

- A typed user turn submitted during speech mode stays in the conversation before the assistant reply that follows from that submit.
- Ending speech mode tears down only the speech runtime. It does not reset `conversationTurns`, and text chat can continue from the preserved history immediately after speech ends.
- Speech teardown and full conversation reset remain distinct actions:
  - `endSpeechMode()` exits speech mode, preserves conversation history, and clears transient speech-only turn state.
  - `endSession()` performs the full runtime reset and clears conversation history.
- Speech teardown now clears queued mixed-mode reply state, active voice-turn references, and streaming transcript scratch so later speech sessions start fresh without mutating preserved history or leaving orphan streaming turns behind.
