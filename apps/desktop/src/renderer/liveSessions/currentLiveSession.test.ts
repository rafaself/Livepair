import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidateCurrentLiveSessionResumption,
  resetCurrentLiveSessionForTests,
  restoreCurrentLiveSession,
  startCurrentLiveSession,
} from './currentLiveSession';
import { resetCurrentChatMemoryForTests, switchToChat } from '../chatMemory/currentChatMemory';

describe('currentLiveSession restore metadata', () => {
  beforeEach(() => {
    resetCurrentChatMemoryForTests();
    resetCurrentLiveSessionForTests();
  });

  it('creates a new Live session against the selected historical chat container', async () => {
    const bridge = {
      createLiveSession: vi.fn(async (request) => ({
        id: 'live-session-selected-chat',
        chatId: request.chatId,
        startedAt: request.startedAt ?? '2026-03-12T09:20:00.000Z',
        endedAt: null,
        status: 'active' as const,
        endedReason: null,
        voice: request.voice,
        resumptionHandle: null,
        lastResumptionUpdateAt: null,
        restorable: false,
        invalidatedAt: null,
        invalidationReason: null,
      })),
      updateLiveSession: vi.fn(),
      endLiveSession: vi.fn(),
      getChat: vi.fn(async (chatId: string) =>
        chatId === 'chat-history-1'
          ? {
              id: 'chat-history-1',
              title: 'Earlier session',
              createdAt: '2026-03-10T09:00:00.000Z',
              updatedAt: '2026-03-10T09:05:00.000Z',
              isCurrent: false,
            }
          : null,
      ),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({
        id: 'chat-current',
        title: 'Current chat',
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:05:00.000Z',
        isCurrent: true,
      }),
      listChatMessages: vi.fn().mockResolvedValue([]),
      listLiveSessions: vi.fn().mockResolvedValue([
        {
          id: 'live-session-history',
          chatId: 'chat-history-1',
          startedAt: '2026-03-10T09:20:00.000Z',
          endedAt: '2026-03-10T09:25:00.000Z',
          status: 'ended',
          endedReason: 'user-ended',
          voice: 'Kore',
          resumptionHandle: null,
          lastResumptionUpdateAt: '2026-03-10T09:25:00.000Z',
          restorable: false,
          invalidatedAt: '2026-03-10T09:25:00.000Z',
          invalidationReason: 'user-ended',
        },
      ]),
    } as unknown as typeof window.bridge;

    await switchToChat('chat-history-1', bridge as never);
    await startCurrentLiveSession({ voicePreference: 'Aoede' }, bridge);

    expect(bridge.createLiveSession).toHaveBeenCalledWith({
      chatId: 'chat-history-1',
      voice: 'Kore',
      startedAt: expect.any(String),
    });
    expect(bridge.getOrCreateCurrentChat).not.toHaveBeenCalled();
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
          voice: 'Aoede',
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
          voice: 'Kore',
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
      voice: 'Kore',
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
          voice: 'Aoede',
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

  it('invalidates the current persisted session when config must apply on a fresh session', async () => {
    const bridge = {
      createLiveSession: vi.fn(async (request) => ({
        id: 'live-session-current',
        chatId: request.chatId,
        startedAt: request.startedAt ?? '2026-03-12T09:20:00.000Z',
        endedAt: null,
        status: 'active' as const,
        endedReason: null,
        voice: request.voice,
        resumptionHandle: 'handles/live-session-current',
        lastResumptionUpdateAt: '2026-03-12T09:21:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      })),
      updateLiveSession: vi.fn(async (request) => ({
        id: request.id,
        chatId: 'chat-current',
        startedAt: '2026-03-12T09:20:00.000Z',
        endedAt: null,
        status: 'active' as const,
        endedReason: null,
        voice: 'Puck',
        resumptionHandle: 'handles/live-session-current',
        lastResumptionUpdateAt: '2026-03-12T09:21:00.000Z',
        restorable: false,
        invalidatedAt: request.invalidatedAt ?? null,
        invalidationReason: request.invalidationReason ?? null,
      })),
      endLiveSession: vi.fn(),
      getOrCreateCurrentChat: vi.fn().mockResolvedValue({ id: 'chat-current' }),
      listLiveSessions: vi.fn().mockResolvedValue([]),
    } as unknown as typeof window.bridge;

    await startCurrentLiveSession({ voicePreference: 'Puck' }, bridge);

    await expect(
      invalidateCurrentLiveSessionResumption(
        'Grounding setting changed; start a new session to apply it.',
        bridge,
      ),
    ).resolves.toMatchObject({
      id: 'live-session-current',
      restorable: false,
      invalidationReason: 'Grounding setting changed; start a new session to apply it.',
    });
    expect(bridge.updateLiveSession).toHaveBeenCalledWith({
      id: 'live-session-current',
      kind: 'resumption',
      restorable: false,
      invalidatedAt: expect.any(String),
      invalidationReason: 'Grounding setting changed; start a new session to apply it.',
    });
  });
});
