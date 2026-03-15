import {
  filterEligibleCaptureSources,
  type CaptureSource,
} from './captureSourceRegistry';

/**
 * Selects a fallback source only when automatic resolution is safe.
 *
 * Priority:
 * 1. The only non-excluded source when exactly one eligible source exists.
 * 2. null — otherwise require an explicit user choice or system picker.
 *
 * Manual source selection bypasses this function entirely.
 */
export function selectAutoSource(
  sources: readonly CaptureSource[],
  excludedIds: ReadonlySet<string> = new Set(),
): CaptureSource | null {
  const eligible = filterEligibleCaptureSources(sources, excludedIds);
  return eligible.length === 1 ? eligible[0] ?? null : null;
}
