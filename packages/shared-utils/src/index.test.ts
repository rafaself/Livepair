import { describe, expect, it } from 'vitest';
import { formatTimestamp, noop } from './index';

describe('shared-utils', () => {
  it('formatTimestamp uses provided date', () => {
    const date = new Date('2026-01-02T03:04:05.000Z');
    expect(formatTimestamp(date)).toBe('2026-01-02T03:04:05.000Z');
  });

  it('formatTimestamp defaults to current date and noop does nothing', () => {
    const iso = formatTimestamp();
    expect(new Date(iso).toISOString()).toBe(iso);
    expect(noop()).toBeUndefined();
  });
});
