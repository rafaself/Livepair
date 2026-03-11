/**
 * Merges an incoming transcript update into the previous text, handling
 * progressive / corrective delivery patterns from Gemini Live.
 *
 * Cases handled:
 *  - identical → no change
 *  - empty incoming → no change
 *  - outright replacement (longer or completely different) → use incoming
 *  - suffix append with overlap → stitch at the overlapping boundary
 *  - shorter correction → treat as replacement
 */
export function normalizeTranscriptText(previous: string, incoming: string): string {
  if (incoming.length === 0 || incoming === previous) {
    return previous;
  }

  if (previous.length === 0) {
    return incoming;
  }

  if (incoming.startsWith(previous) || incoming.length > previous.length) {
    return incoming;
  }

  if (incoming.length < previous.length) {
    return incoming;
  }

  const overlapLimit = Math.min(previous.length, incoming.length);

  for (let overlap = overlapLimit; overlap > 0; overlap -= 1) {
    if (previous.endsWith(incoming.slice(0, overlap))) {
      return `${previous}${incoming.slice(overlap)}`;
    }
  }

  return `${previous}${incoming}`;
}
