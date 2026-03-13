import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetCurrentLiveSessionForTests,
  restoreCurrentLiveSession,
} from './currentLiveSession';

describe('currentLiveSession restore metadata', () => {
  beforeEach(() => {
    resetCurrentLiveSessionForTests();
  });

  it('restores only an explicitly restorable persisted Live session', async () => {
    const bridge = {
      createLiveSession: vi.fn(),
      updateLiveSession: vi.fn(),
      endLiveSession: vi.fn(),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({ id: 'chat-1' }),
      listLiveSessions: vi.fn().mockResolvedValue([
        {
          id: 'live-session-newer',
          chatId: 'chat-1',
          startedAt: '2026-03-12T09:10:00.000Z',
          endedAt: null,
          status: 'active',
          endedReason: null,
          resumptionHandle: null,
          lastResumptionUpdateAt: null,
          restorable: false,
          invalidatedAt: '2026-03-12T09:11:00.000Z',
          invalidationReason: 'Gemini Live session is not resumable at this point',
        },
        {
          id: 'live-session-restorable',
          chatId: 'chat-1',
          startedAt: '2026-03-12T09:00:00.000Z',
          endedAt: null,
          status: 'active',
          endedReason: null,
          resumptionHandle: 'handles/live-session-restorable',
          lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
          restorable: true,
          invalidatedAt: null,
          invalidationReason: null,
        },
      ]),
    } as unknown as typeof window.bridge;

    await expect(restoreCurrentLiveSession(bridge)).resolves.toEqual({
      id: 'live-session-restorable',
      chatId: 'chat-1',
      startedAt: '2026-03-12T09:00:00.000Z',
      endedAt: null,
      status: 'active',
      endedReason: null,
      resumptionHandle: 'handles/live-session-restorable',
      lastResumptionUpdateAt: '2026-03-12T09:01:00.000Z',
      restorable: true,
      invalidatedAt: null,
      invalidationReason: null,
    });
  });

  it('ends skipped active non-restorable rows before returning no restore candidate', async () => {
    const bridge = {
      createLiveSession: vi.fn(),
      updateLiveSession: vi.fn(),
      endLiveSession: vi.fn(async (request) => request),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({ id: 'chat-1' }),
      listLiveSessions: vi.fn().mockResolvedValue([
        {
          id: 'live-session-stale',
          chatId: 'chat-1',
          startedAt: '2026-03-12T09:10:00.000Z',
          endedAt: null,
          status: 'active',
          endedReason: null,
          resumptionHandle: null,
          lastResumptionUpdateAt: '2026-03-12T09:11:00.000Z',
          restorable: false,
          invalidatedAt: '2026-03-12T09:11:00.000Z',
          invalidationReason: 'Gemini Live session is not resumable at this point',
        },
      ]),
    } as unknown as typeof window.bridge;

    await expect(restoreCurrentLiveSession(bridge)).resolves.toBeNull();
    expect(bridge.endLiveSession).toHaveBeenCalledWith({
      id: 'live-session-stale',
      endedAt: expect.any(String),
      status: 'failed',
      endedReason: 'Gemini Live session is not resumable at this point',
    });
  });
});
