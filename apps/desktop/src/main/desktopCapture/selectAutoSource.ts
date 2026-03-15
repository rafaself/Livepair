import {
  filterEligibleCaptureSources,
  type CaptureSource,
} from './captureSourceRegistry';

/**
 * Selects a fallback source only when automatic resolution is safe.
 *
 * Priority:
 * 1. The only non-excluded source when exactly one eligible source exists.
 * 2. The first screen (display) source when one or more screen sources exist
 *    and no explicit selection has been made — the primary display is the
 *    unambiguous default most users expect.
 * 3. null — only window sources remain; require an explicit user choice.
 *
 * Manual source selection bypasses this function entirely.
 */
export function selectAutoSource(
  sources: readonly CaptureSource[],
  excludedIds: ReadonlySet<string> = new Set(),
): CaptureSource | null {
  const eligible = filterEligibleCaptureSources(sources, excludedIds);
  if (eligible.length === 1) return eligible[0] ?? null;
  const screenSource = eligible.find((s) => s.id.startsWith('screen:'));
  return screenSource ?? null;
}
