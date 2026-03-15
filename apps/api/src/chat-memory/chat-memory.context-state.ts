import type { RehydrationPacketContextState } from '@livepair/shared-types';

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isStateEntry(
  value: unknown,
): value is RehydrationPacketContextState['task']['entries'][number] {
  return (
    isPlainRecord(value) &&
    typeof value['key'] === 'string' &&
    typeof value['value'] === 'string'
  );
}

function isStateSection(value: unknown): value is RehydrationPacketContextState['task'] {
  return (
    isPlainRecord(value) &&
    Array.isArray(value['entries']) &&
    value['entries'].every((entry) => isStateEntry(entry))
  );
}

export function isRehydrationPacketContextState(
  value: unknown,
): value is RehydrationPacketContextState {
  return (
    isPlainRecord(value) &&
    isStateSection(value['task']) &&
    isStateSection(value['context'])
  );
}

export function parsePersistedContextStateSnapshot(
  value: unknown,
): RehydrationPacketContextState | null {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  const parsedValue = typeof value === 'string' ? JSON.parse(value) : value;

  if (!isRehydrationPacketContextState(parsedValue)) {
    throw new Error('Persisted context state snapshot has an invalid shape');
  }

  return parsedValue;
}
