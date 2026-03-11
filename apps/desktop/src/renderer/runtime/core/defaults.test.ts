import { describe, expect, it } from 'vitest';
import {
  createDefaultVoiceSessionDurabilityState,
  createDefaultVoiceSessionResumptionState,
  createDefaultVoiceToolState,
} from './defaults';

describe('default state factories', () => {
  it('creates default voice session resumption state', () => {
    expect(createDefaultVoiceSessionResumptionState()).toEqual({
      status: 'idle',
      latestHandle: null,
      resumable: false,
      lastDetail: null,
    });
  });

  it('creates default voice session durability state', () => {
    expect(createDefaultVoiceSessionDurabilityState()).toEqual({
      compressionEnabled: false,
      tokenValid: false,
      tokenRefreshing: false,
      tokenRefreshFailed: false,
      expireTime: null,
      newSessionExpireTime: null,
      lastDetail: null,
    });
  });

  it('creates default voice tool state', () => {
    expect(createDefaultVoiceToolState()).toEqual({
      status: 'idle',
      toolName: null,
      callId: null,
      lastError: null,
    });
  });

  it('returns a new object on each call', () => {
    const a = createDefaultVoiceSessionResumptionState();
    const b = createDefaultVoiceSessionResumptionState();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
