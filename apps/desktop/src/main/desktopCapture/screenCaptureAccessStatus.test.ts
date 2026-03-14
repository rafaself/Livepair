// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetMediaAccessStatus = vi.fn();

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: mockGetMediaAccessStatus,
  },
}));

describe('getScreenCaptureAccessStatus', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns the macOS screen recording access status on darwin', async () => {
    mockGetMediaAccessStatus.mockReturnValueOnce('denied');
    const { getScreenCaptureAccessStatus } = await import('./screenCaptureAccessStatus');

    expect(getScreenCaptureAccessStatus('darwin')).toEqual({
      platform: 'darwin',
      permissionStatus: 'denied',
    });
    expect(mockGetMediaAccessStatus).toHaveBeenCalledWith('screen');
  });

  it('returns a null permission status on non-mac platforms', async () => {
    const { getScreenCaptureAccessStatus } = await import('./screenCaptureAccessStatus');

    expect(getScreenCaptureAccessStatus('linux')).toEqual({
      platform: 'linux',
      permissionStatus: null,
    });
    expect(mockGetMediaAccessStatus).not.toHaveBeenCalled();
  });

  it('falls back to unknown when Electron cannot read the macOS status', async () => {
    mockGetMediaAccessStatus.mockImplementationOnce(() => {
      throw new Error('native failure');
    });
    const { getScreenCaptureAccessStatus } = await import('./screenCaptureAccessStatus');

    expect(getScreenCaptureAccessStatus('darwin')).toEqual({
      platform: 'darwin',
      permissionStatus: 'unknown',
    });
  });
});
