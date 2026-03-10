import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { __resetGeminiLiveSdkMock } from './geminiLiveSdkMock';
import { resetDesktopSessionController } from '../runtime/sessionController';
import { resetDesktopStores } from '../store/testing';

beforeEach(async () => {
  if (typeof window === 'undefined') {
    return;
  }

  await resetDesktopSessionController();
  resetDesktopStores();
  __resetGeminiLiveSdkMock();
  window.bridge = {
    overlayMode: 'linux-shape',
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    startTextChatStream: vi.fn(async () => ({
      cancel: vi.fn(async () => undefined),
    })),
    getSettings: vi.fn(async () => DEFAULT_DESKTOP_SETTINGS),
    updateSettings: vi.fn(async (patch) => ({ ...DEFAULT_DESKTOP_SETTINGS, ...patch })),
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
  };
});
