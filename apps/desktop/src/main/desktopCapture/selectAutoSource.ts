import type { CaptureSource } from './captureSourceRegistry';

/**
 * Selects the best source for automatic (no-user-selection) capture.
 *
 * Priority:
 * 1. First non-excluded `screen:*` source — always prefer a real display.
 * 2. First non-excluded `window:*` source — deterministic fallback.
 * 3. null — nothing usable remains.
 *
 * Manual source selection bypasses this function entirely; the registry's
 * `getSelectedSource()` result is used directly in that case.
 */
export function selectAutoSource(
  sources: readonly CaptureSource[],
  excludedIds: ReadonlySet<string> = new Set(),
): CaptureSource | null {
  const eligible = sources.filter((s) => !excludedIds.has(s.id));
  return eligible.find((s) => s.id.startsWith('screen:')) ?? eligible[0] ?? null;
}
