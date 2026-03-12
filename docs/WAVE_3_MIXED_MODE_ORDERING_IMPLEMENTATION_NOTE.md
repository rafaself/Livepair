## Wave 3 Implementation Note

- Speech-mode typed submits now queue an explicit mixed-mode assistant reply anchor as soon as the typed user turn is appended.
- The voice transcript controller consumes that anchor only when it can safely open a fresh assistant voice turn, which prevents stale completed or interrupted assistant slots from being reused above the typed user turn.
- If an earlier assistant voice turn is still streaming, the queued mixed-mode anchor waits for that turn to settle before opening the next assistant reply slot. This keeps prior speech output intact while ensuring the typed follow-up reply is created below the typed user message.

## Enforced Invariant

- When a typed user turn is submitted while speech mode is active, the next assistant reply associated with that submit must render in a fresh assistant turn that appears after the typed user turn.
- Once a mixed-mode assistant reply anchor is consumed, later transcript promotion/finalization continues on that same assistant turn and does not mutate an earlier finalized assistant bubble.

## Remaining Closing-Wave Work

- Run the final closing-wave verification sweep across any broader demo or end-to-end scenarios that combine repeated speech/text alternation beyond the focused runtime regressions added in this wave.
