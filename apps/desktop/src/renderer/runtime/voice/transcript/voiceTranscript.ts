type NormalizeTranscriptTextOptions = {
  role?: 'user' | 'assistant';
  isFinal?: boolean | undefined;
};

export type SettledUserTranscriptUpdateClassification =
  | 'settled-replay'
  | 'settled-correction'
  | 'new-turn';

const COMMON_SHORT_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'da', 'de', 'do', 'e', 'em', 'eu', 'for',
  'go', 'he', 'i', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'o', 'of', 'on', 'or', 'os',
  'pra', 'pro', 'que', 'so', 'the', 'to', 'um', 'uma', 'up', 'us', 'we', 'you',
]);

function findSharedPrefixLength(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;

  while (index < limit && left[index] === right[index]) {
    index += 1;
  }

  return index;
}

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

function endsWithWordCharacter(text: string): boolean {
  return /[\p{L}\p{N}]$/u.test(text);
}

function startsWithApostropheSuffix(incoming: string): boolean {
  return /^['’](?:s|re|ve|ll|d|m|t|em|cause)(?=$|[\s,.;!?)])/u.test(incoming);
}

function trailingWordFragment(text: string): string | null {
  const match = text.match(/([\p{L}]+)$/u);
  return match?.[1] ?? null;
}

function leadingWordFragment(text: string): string | null {
  const match = text.match(/^([\p{L}]+)/u);
  return match?.[1] ?? null;
}

function startsWithLikelyWordContinuation(fragment: string): boolean {
  return /^(?:[a-z]?ing|[a-z]?ed|[a-z]?er|[a-z]?ers|[a-z]?est|[a-z]?ly|[a-z]{0,2}(?:ment|ness|tion|sion|able|ible))$/i.test(fragment);
}

function shouldAttachUserWordContinuation(previous: string, incoming: string): boolean {
  if (!endsWithWordCharacter(previous) || /^\s/u.test(incoming)) {
    return false;
  }

  const previousFragment = trailingWordFragment(previous);
  const incomingFragment = leadingWordFragment(incoming);

  if (!previousFragment || !incomingFragment) {
    return false;
  }

  const previousLower = previousFragment.toLowerCase();

  if (
    previousFragment !== previousLower
    || incomingFragment !== incomingFragment.toLowerCase()
    || previousFragment.length > 4
    || COMMON_SHORT_WORDS.has(previousLower)
  ) {
    return false;
  }

  return startsWithLikelyWordContinuation(incomingFragment);
}

function shouldTreatAsUserCorrection(
  previous: string,
  incoming: string,
  sharedPrefixLength: number,
): boolean {
  const shortestLength = Math.min(previous.length, incoming.length);

  if (shortestLength < 6) {
    return false;
  }

  return sharedPrefixLength >= 4 && sharedPrefixLength / shortestLength >= 0.6;
}

function appendSeparatedTranscriptChunk(previous: string, incoming: string): string {
  return `${previous.trimEnd()} ${incoming.trimStart()}`;
}

export function classifySettledUserTranscriptUpdate(
  previous: string,
  incoming: string,
  { isFinal = false }: Pick<NormalizeTranscriptTextOptions, 'isFinal'> = {},
): SettledUserTranscriptUpdateClassification {
  const previousTrimmed = previous.trim();
  const incomingTrimmed = incoming.trim();

  if (incomingTrimmed.length === 0 || incomingTrimmed === previousTrimmed) {
    return 'settled-replay';
  }

  const normalized = normalizeTranscriptText(previous, incoming, {
    role: 'user',
    isFinal,
  });

  if (normalized.trim() === previousTrimmed) {
    return 'settled-replay';
  }

  const sharedPrefixLength = findSharedPrefixLength(previous, incoming);
  const overlap = findTranscriptOverlap(previous, incoming);
  const sameUtterance =
    shouldTreatAsUserCorrection(previous, incoming, sharedPrefixLength)
    || overlap > 0
    || canAppendTranscriptChunk(previous, incoming)
    || (endsWithWordCharacter(previous) && startsWithApostropheSuffix(incoming))
    || shouldAttachUserWordContinuation(previous, incoming)
    || previousTrimmed.includes(incomingTrimmed)
    || incomingTrimmed.includes(previousTrimmed);

  return sameUtterance ? 'settled-correction' : 'new-turn';
}

/**
 * Reconciles an incoming transcript update with the best current text while
 * tolerating Gemini Live's mix of progressive, corrective, and out-of-order
 * deliveries.
 */
export function normalizeTranscriptText(
  previous: string,
  incoming: string,
  { role = 'assistant', isFinal = false }: NormalizeTranscriptTextOptions = {},
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

  const sharedPrefixLength = role === 'user' ? findSharedPrefixLength(previous, incoming) : 0;

  if (previous.includes(incoming)) {
    if (role === 'user' && isFinal && shouldTreatAsUserCorrection(previous, incoming, sharedPrefixLength)) {
      return incoming;
    }

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

  if (role === 'user') {
    if (endsWithWordCharacter(previous) && startsWithApostropheSuffix(incoming)) {
      return `${previous}${incoming}`;
    }

    if (shouldAttachUserWordContinuation(previous, incoming)) {
      return `${previous}${incoming}`;
    }

    if (shouldTreatAsUserCorrection(previous, incoming, sharedPrefixLength)) {
      return incoming;
    }

    return appendSeparatedTranscriptChunk(previous, incoming);
  }

  return incoming;
}
