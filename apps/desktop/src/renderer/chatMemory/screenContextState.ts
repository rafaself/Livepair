import type {
  RehydrationPacketContextState,
  RehydrationPacketStateEntry,
} from '@livepair/shared-types';

export const SCREEN_CONTEXT_SUMMARY_KEY = 'screenContextSummary';
export const MAX_SCREEN_CONTEXT_SUMMARY_LENGTH = 500;
const MAX_REHYDRATION_TASK_STATE_ENTRIES = 4;
const MAX_REHYDRATION_CONTEXT_STATE_ENTRIES = 4;

function normalizeStateEntry(
  entry: RehydrationPacketStateEntry | undefined,
): RehydrationPacketStateEntry | null {
  if (!entry) {
    return null;
  }

  const key = entry.key.trim();
  const value = entry.value.trim();

  if (key.length === 0 || value.length === 0) {
    return null;
  }

  return {
    key,
    value,
  };
}

function normalizeStateEntries(
  entries: readonly RehydrationPacketStateEntry[],
  maxEntries: number,
): RehydrationPacketStateEntry[] {
  const dedupedEntries: RehydrationPacketStateEntry[] = [];
  const seenKeys = new Set<string>();

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const normalizedEntry = normalizeStateEntry(entries[index]);

    if (normalizedEntry === null || seenKeys.has(normalizedEntry.key)) {
      continue;
    }

    seenKeys.add(normalizedEntry.key);
    dedupedEntries.push(normalizedEntry);

    if (dedupedEntries.length >= maxEntries) {
      break;
    }
  }

  return dedupedEntries.reverse();
}

function normalizeScreenContextSummaryValue(value: string): string | null {
  const trimmedValue = value.trim();

  if (
    trimmedValue.length === 0
    || trimmedValue.startsWith('data:')
    || trimmedValue.includes('base64,')
  ) {
    return null;
  }

  return trimmedValue.slice(0, MAX_SCREEN_CONTEXT_SUMMARY_LENGTH);
}

export function getScreenContextSummaryFromEntries(
  entries: readonly RehydrationPacketStateEntry[],
): string | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry?.key !== SCREEN_CONTEXT_SUMMARY_KEY) {
      continue;
    }

    return normalizeScreenContextSummaryValue(entry.value);
  }

  return null;
}

export function normalizeScreenContextState(
  contextState: RehydrationPacketContextState,
): RehydrationPacketContextState {
  const nonScreenEntries = normalizeStateEntries(
    contextState.context.entries.filter((entry) => entry.key !== SCREEN_CONTEXT_SUMMARY_KEY),
    MAX_REHYDRATION_CONTEXT_STATE_ENTRIES,
  );
  const screenContextSummary = getScreenContextSummaryFromEntries(contextState.context.entries);

  if (screenContextSummary !== null) {
    nonScreenEntries.push({
      key: SCREEN_CONTEXT_SUMMARY_KEY,
      value: screenContextSummary,
    });
  }

  return {
    task: {
      entries: normalizeStateEntries(
        contextState.task.entries,
        MAX_REHYDRATION_TASK_STATE_ENTRIES,
      ),
    },
    context: {
      entries: nonScreenEntries,
    },
  };
}
