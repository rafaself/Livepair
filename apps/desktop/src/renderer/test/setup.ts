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
    setOverlayHitRegions: vi.fn(),
    setOverlayPointerPassthrough: vi.fn(),
  };
});
