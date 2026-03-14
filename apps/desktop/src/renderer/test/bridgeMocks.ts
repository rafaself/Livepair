import { vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS, type DesktopBridge } from '../../shared';

function buildBaseMockDesktopBridge() {
  return {
    overlayMode: 'linux-shape' as DesktopBridge['overlayMode'],
    quitApp: vi.fn(),
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    createChat: vi.fn(),
    getChat: vi.fn(),
    getOrCreateCurrentChat: vi.fn(),
    listChats: vi.fn(),
    listChatMessages: vi.fn(),
    getChatSummary: vi.fn(),
    appendChatMessage: vi.fn(),
    createLiveSession: vi.fn(),
    listLiveSessions: vi.fn(),
    updateLiveSession: vi.fn(),
    endLiveSession: vi.fn(),
    getSettings: vi.fn(async () => DEFAULT_DESKTOP_SETTINGS),
    updateSettings: vi.fn(async (patch) => ({ ...DEFAULT_DESKTOP_SETTINGS, ...patch })),
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
    getScreenCaptureAccessStatus: vi.fn(async () => ({
      platform: 'linux',
      permissionStatus: null,
    })),
    listScreenCaptureSources: vi.fn(async () => ({
      sources: [],
      selectedSourceId: null,
    })),
    selectScreenCaptureSource: vi.fn(async (sourceId) => ({
      sources: [],
      selectedSourceId: sourceId,
    })),
    startScreenFrameDumpSession: vi.fn(async () => ({
      directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
    })),
    saveScreenFrameDumpFrame: vi.fn(async () => undefined),
  } satisfies DesktopBridge;
}

export type MockDesktopBridge = ReturnType<typeof buildBaseMockDesktopBridge>;

export function createMockDesktopBridge(
  overrides: Partial<MockDesktopBridge> = {},
): MockDesktopBridge {
  return {
    ...buildBaseMockDesktopBridge(),
    ...overrides,
  };
}
