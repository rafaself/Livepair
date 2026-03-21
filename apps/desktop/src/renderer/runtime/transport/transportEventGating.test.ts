import { describe, expect, it } from 'vitest';
import {
  isAssistantTurnUnavailable,
  shouldIgnoreTermination,
} from './transportEventGating';
import type { VoiceSessionStatus } from '../voice/voice.types';

describe('transportEventGating', () => {
  describe('shouldIgnoreTermination', () => {
    const ignored: VoiceSessionStatus[] = ['stopping', 'disconnected', 'error'];
    const notIgnored: VoiceSessionStatus[] = ['connecting', 'active', 'recovering', 'interrupted'];

    it.each(ignored)('returns true for %s', (status) => {
      expect(shouldIgnoreTermination(status)).toBe(true);
    });

    it.each(notIgnored)('returns false for %s', (status) => {
      expect(shouldIgnoreTermination(status)).toBe(false);
    });
  });

  describe('isAssistantTurnUnavailable', () => {
    const unavailable: VoiceSessionStatus[] = [
      'interrupted', 'recovering', 'stopping', 'disconnected', 'error',
    ];
    const available: VoiceSessionStatus[] = ['connecting', 'active'];

    it.each(unavailable)('returns true for %s', (status) => {
      expect(isAssistantTurnUnavailable(status)).toBe(true);
    });

    it.each(available)('returns false for %s', (status) => {
      expect(isAssistantTurnUnavailable(status)).toBe(false);
    });
  });
});
