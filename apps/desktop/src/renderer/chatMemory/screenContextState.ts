import type {
  RehydrationPacketContextState,
  RehydrationPacketStateEntry,
} from '@livepair/shared-types';

export const SCREEN_CONTEXT_SUMMARY_KEY = 'screenContextSummary';
export const MAX_SCREEN_CONTEXT_SUMMARY_LENGTH = 500;

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
  const nonScreenEntries = contextState.context.entries
    .filter((entry) => entry.key !== SCREEN_CONTEXT_SUMMARY_KEY)
    .map((entry) => ({ ...entry }));
  const screenContextSummary = getScreenContextSummaryFromEntries(contextState.context.entries);

  if (screenContextSummary !== null) {
    nonScreenEntries.push({
      key: SCREEN_CONTEXT_SUMMARY_KEY,
      value: screenContextSummary,
    });
  }

  return {
    task: {
      entries: contextState.task.entries.map((entry) => ({ ...entry })),
    },
    context: {
      entries: nonScreenEntries,
    },
  };
}
