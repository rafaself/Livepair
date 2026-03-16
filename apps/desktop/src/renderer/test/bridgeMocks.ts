import { vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS, type DesktopBridge } from '../../shared';

const DEFAULT_OVERLAY_DISPLAY = {
  displayId: '1',
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  scaleFactor: 1,
} as const;

function buildBaseMockDesktopBridge() {
  return {
    overlayMode: 'linux-shape' as DesktopBridge['overlayMode'],
    quitApp: vi.fn(),
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    searchProjectKnowledge: vi.fn(async () => ({
      summaryAnswer: 'No project knowledge result available in the default test bridge.',
      supportingExcerpts: [],
      sources: [],
      confidence: 'low' as const,
      retrievalStatus: 'no_match' as const,
      failureReason: 'not_stubbed',
    })),
    reportLiveTelemetry: vi.fn(async () => undefined),
    createChat: vi.fn(),
    getChat: vi.fn(),
    getCurrentChat: vi.fn(),
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
      overlayDisplay: DEFAULT_OVERLAY_DISPLAY,
    })),
    selectScreenCaptureSource: vi.fn(async (sourceId) => ({
      sources: [],
      selectedSourceId: sourceId,
      overlayDisplay: DEFAULT_OVERLAY_DISPLAY,
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
