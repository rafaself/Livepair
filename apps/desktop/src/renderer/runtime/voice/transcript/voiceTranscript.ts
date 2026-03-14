type NormalizeTranscriptTextOptions = {
  role?: 'user' | 'assistant';
  isFinal?: boolean | undefined;
};

function findTranscriptOverlap(previous: string, incoming: string): number {
  const overlapLimit = Math.min(previous.length, incoming.length);

  for (let overlap = overlapLimit; overlap > 0; overlap -= 1) {
    if (previous.endsWith(incoming.slice(0, overlap))) {
      return overlap;
    }
  }

  return 0;
}

function canAppendTranscriptChunk(previous: string, incoming: string): boolean {
  return /^[\s,.;!?)]/.test(incoming) || /[\s(/-]$/.test(previous);
}

/**
 * Reconciles an incoming transcript update with the best current text while
 * tolerating Gemini Live's mix of progressive, corrective, and out-of-order
 * deliveries.
 */
export function normalizeTranscriptText(
  previous: string,
  incoming: string,
  { role: _role = 'assistant', isFinal = false }: NormalizeTranscriptTextOptions = {},
): string {
  if (incoming.length === 0 || incoming === previous) {
    return previous;
  }

  if (previous.length === 0) {
    return incoming;
  }

  if (incoming.startsWith(previous) || incoming.includes(previous)) {
    return incoming;
  }

  if (previous.includes(incoming) && !isFinal) {
    return previous;
  }

  const overlap = findTranscriptOverlap(previous, incoming);

  if (overlap > 0) {
    return `${previous}${incoming.slice(overlap)}`;
  }

  if (canAppendTranscriptChunk(previous, incoming)) {
    const normalizedIncoming = incoming.trimStart();

    if (normalizedIncoming.length === 0 || previous.includes(normalizedIncoming)) {
      return previous;
    }

    return `${previous}${incoming}`;
  }

  return incoming;
}
