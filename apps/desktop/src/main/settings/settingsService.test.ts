// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetPath = vi.fn(() => '/tmp/livepair-user-data');

vi.mock('electron', () => ({
  app: {
    getPath: mockGetPath,
  },
}));

const repositoryConstructor = vi.fn();

vi.mock('./settingsRepository', () => ({
  DesktopSettingsRepository: vi.fn().mockImplementation((settingsFilePath: string) => {
    repositoryConstructor(settingsFilePath);
    return {
      getSettings: vi.fn(async () => ({
        backendUrl: 'http://localhost:3000',
        isPanelPinned: false,
        preferredMode: 'fast',
        selectedInputDeviceId: 'default',
        selectedOutputDeviceId: 'default',
        selectedCaptureDisplayId: 'primary',
        selectedOverlayDisplayId: 'primary',
        themePreference: 'system',
      })),
      updateSettings: vi.fn(async (patch) => ({
        backendUrl: patch.backendUrl ?? 'http://localhost:3000',
        isPanelPinned: patch.isPanelPinned ?? false,
        preferredMode: patch.preferredMode ?? 'fast',
        selectedInputDeviceId: patch.selectedInputDeviceId ?? 'default',
        selectedOutputDeviceId: patch.selectedOutputDeviceId ?? 'default',
        selectedCaptureDisplayId: patch.selectedCaptureDisplayId ?? 'primary',
        selectedOverlayDisplayId: patch.selectedOverlayDisplayId ?? 'primary',
        themePreference: patch.themePreference ?? 'system',
      })),
    };
  }),
}));

describe('DesktopSettingsService', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('caches the first repository read and refreshes the cache after updates', async () => {
    const { DesktopSettingsService } = await import('./settingsService');
    const repository = {
      getSettings: vi.fn(async () => ({
        backendUrl: 'http://localhost:3000',
        isPanelPinned: false,
        preferredMode: 'fast' as const,
        selectedInputDeviceId: 'default',
        selectedOutputDeviceId: 'default',
        selectedCaptureDisplayId: 'primary',
        selectedOverlayDisplayId: 'primary',
        themePreference: 'system' as const,
      })),
      updateSettings: vi.fn(async () => ({
        backendUrl: 'https://api.livepair.dev',
        isPanelPinned: true,
        preferredMode: 'thinking' as const,
        selectedInputDeviceId: 'usb-mic',
        selectedOutputDeviceId: 'desk-speakers',
        selectedCaptureDisplayId: 'display-2',
        selectedOverlayDisplayId: 'display-3',
        themePreference: 'dark' as const,
      })),
    };

    const service = new DesktopSettingsService(repository as never);

    await expect(service.getSettings()).resolves.toEqual(
      expect.objectContaining({ backendUrl: 'http://localhost:3000' }),
    );
    await expect(service.getSettings()).resolves.toEqual(
      expect.objectContaining({ backendUrl: 'http://localhost:3000' }),
    );
    expect(repository.getSettings).toHaveBeenCalledTimes(1);

    await expect(service.updateSettings({ backendUrl: 'https://api.livepair.dev' })).resolves.toEqual(
      expect.objectContaining({ backendUrl: 'https://api.livepair.dev' }),
    );
    expect(repository.updateSettings).toHaveBeenCalledWith({
      backendUrl: 'https://api.livepair.dev',
    });

    await expect(service.getSettings()).resolves.toEqual(
      expect.objectContaining({
        backendUrl: 'https://api.livepair.dev',
        isPanelPinned: true,
      }),
    );
    expect(repository.getSettings).toHaveBeenCalledTimes(1);
  });

  it('creates a singleton repository rooted in the electron userData path', async () => {
    const { getDesktopSettingsService } = await import('./settingsService');

    const firstInstance = getDesktopSettingsService();
    const secondInstance = getDesktopSettingsService();

    expect(firstInstance).toBe(secondInstance);
    expect(mockGetPath).toHaveBeenCalledWith('userData');
    expect(repositoryConstructor).toHaveBeenCalledTimes(1);
    expect(repositoryConstructor).toHaveBeenCalledWith(
      '/tmp/livepair-user-data/desktop-settings.json',
    );
  });
});
