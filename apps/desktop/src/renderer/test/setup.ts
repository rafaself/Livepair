import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared/settings';
import { resetDesktopStores } from '../store/testing';

beforeEach(() => {
  if (typeof window === 'undefined') {
    return;
  }

  resetDesktopStores();
  window.bridge = {
    overlayMode: 'linux-shape',
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    getSettings: vi.fn(async () => DEFAULT_DESKTOP_SETTINGS),
    updateSettings: vi.fn(async (patch) => ({ ...DEFAULT_DESKTOP_SETTINGS, ...patch })),
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
  };
});
