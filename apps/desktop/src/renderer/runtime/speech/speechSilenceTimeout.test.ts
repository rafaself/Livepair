import { describe, expect, it } from 'vitest';
import { resolveSpeechSilenceTimeoutMs } from './speechSilenceTimeout';

describe('resolveSpeechSilenceTimeoutMs', () => {
  it('returns 30_000 for "30s"', () => {
    expect(resolveSpeechSilenceTimeoutMs('30s')).toBe(30_000);
  });

  it('returns 180_000 for "3m"', () => {
    expect(resolveSpeechSilenceTimeoutMs('3m')).toBe(180_000);
  });

  it('returns null for "never"', () => {
    expect(resolveSpeechSilenceTimeoutMs('never')).toBeNull();
  });
});
