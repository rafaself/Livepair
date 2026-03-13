import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS, type DesktopBridge } from '../../shared';
import { resetCurrentChatMemoryForTests } from '../chatMemory';
import { resetCurrentLiveSessionForTests } from '../liveSessions';
import { __resetGeminiLiveSdkMock } from './geminiLiveSdkMock';
import { resetDesktopSessionController } from '../runtime';
import { resetLiveConfigForTests } from '../runtime/transport/liveConfig';
import { resetDesktopStores } from '../store/testing';

beforeEach(async () => {
  if (typeof window === 'undefined') {
    return;
  }

  const mediaTrack = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const mediaStream = {
    getTracks: vi.fn(() => [mediaTrack]),
  };
  const mediaDevicesEvents = new EventTarget();
  Object.defineProperty(window.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => []),
      getDisplayMedia: vi.fn(async () => mediaStream),
      getUserMedia: vi.fn(async () => mediaStream),
      addEventListener: mediaDevicesEvents.addEventListener.bind(mediaDevicesEvents),
      removeEventListener: mediaDevicesEvents.removeEventListener.bind(mediaDevicesEvents),
    },
  });

  class FakeAudioWorkletNode {
    readonly port = {
      onmessage: null as ((event: MessageEvent) => void) | null,
      onmessageerror: null as ((event: MessageEvent) => void) | null,
    };

    connect = vi.fn();
    disconnect = vi.fn();
  }

  class FakeAudioContext {
    readonly sampleRate = 48_000;
    readonly audioWorklet = {
      addModule: vi.fn(async () => undefined),
    };

    createMediaStreamSource = vi.fn(() => ({
      connect: vi.fn(),
      disconnect: vi.fn(),
    }));
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => undefined);
  }

  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: FakeAudioContext,
  });
  Object.defineProperty(window, 'AudioWorkletNode', {
    configurable: true,
    value: FakeAudioWorkletNode,
  });
  Object.defineProperty(globalThis, 'AudioWorkletNode', {
    configurable: true,
    value: FakeAudioWorkletNode,
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    configurable: true,
    value: vi.fn(async () => undefined),
  });
  Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:livepair-test-worklet'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });

  await resetDesktopSessionController();
  resetDesktopStores();
  resetCurrentChatMemoryForTests();
  resetCurrentLiveSessionForTests();
  resetLiveConfigForTests();
  __resetGeminiLiveSdkMock();
  window.bridge = {
    overlayMode: 'linux-shape',
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    createChat: vi.fn(),
    getChat: vi.fn(),
    getOrCreateCurrentChat: vi.fn(async () => ({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    })),
    listChats: vi.fn(async () => []),
    listChatMessages: vi.fn(async () => []),
    getChatSummary: vi.fn(async () => null),
    appendChatMessage: vi.fn(async (req) => ({
      id: `${req.role}-message-1`,
      chatId: req.chatId,
      role: req.role,
      contentText: req.contentText,
      createdAt: '2026-03-12T09:00:00.000Z',
      sequence: 1,
    })),
    createLiveSession: vi.fn(async (req) => ({
      id: 'live-session-1',
      chatId: req.chatId,
      startedAt: req.startedAt ?? '2026-03-12T09:00:00.000Z',
      endedAt: null,
      status: 'active' as const,
      endedReason: null,
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
    })),
    listLiveSessions: vi.fn(async () => []),
    updateLiveSession: vi.fn(async (req) => ({
      id: req.id,
      chatId: 'chat-1',
      startedAt: '2026-03-12T09:00:00.000Z',
      endedAt: null,
      status: 'active' as const,
      endedReason: null,
      resumptionHandle: req.resumptionHandle ?? null,
      lastResumptionUpdateAt: req.lastResumptionUpdateAt ?? null,
      restorable: req.restorable ?? false,
      invalidatedAt: req.invalidatedAt ?? null,
      invalidationReason: req.invalidationReason ?? null,
    })),
    endLiveSession: vi.fn(async (req) => ({
      id: req.id,
      chatId: 'chat-1',
      startedAt: '2026-03-12T09:00:00.000Z',
      endedAt: req.endedAt ?? '2026-03-12T09:05:00.000Z',
      status: req.status,
      endedReason: req.endedReason ?? null,
      resumptionHandle: null,
      lastResumptionUpdateAt: null,
      restorable: false,
      invalidatedAt: null,
      invalidationReason: null,
    })),
    getSettings: vi.fn(async () => DEFAULT_DESKTOP_SETTINGS),
    updateSettings: vi.fn(async (patch) => ({ ...DEFAULT_DESKTOP_SETTINGS, ...patch })),
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
  } satisfies DesktopBridge;
});
