import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  if (typeof window === 'undefined') {
    return;
  }

  window.bridge = {
    overlayMode: 'linux-shape',
    checkHealth: vi.fn(),
    requestSessionToken: vi.fn(),
    getBackendBaseUrl: vi.fn(async () => 'http://localhost:3000'),
    setBackendBaseUrl: vi.fn(async (url: string) => url),
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
  };
});
