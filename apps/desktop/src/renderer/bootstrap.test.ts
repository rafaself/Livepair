import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { bootstrapDesktopRenderer } from './bootstrap';
import { resetDesktopStores } from './store/testing';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

describe('bootstrapDesktopRenderer', () => {
  beforeEach(() => {
    resetDesktopStores();
    window.localStorage.clear();
    document.documentElement.dataset['theme'] = '';
    document.documentElement.style.colorScheme = '';
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    window.bridge.getSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.updateSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.migrateLegacySettings = vi.fn().mockImplementation(async (snapshot) => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      ...snapshot,
    }));
  });

  it('hydrates settings before render, applies the resolved theme, seeds drafts, and clears migrated legacy keys', async () => {
    window.localStorage.setItem('livepair.backendUrl', 'https://legacy.livepair.dev');
    window.localStorage.setItem('livepair.themePreference', 'dark');

    await bootstrapDesktopRenderer();

    expect(window.bridge.migrateLegacySettings).toHaveBeenCalledWith({
      backendUrl: 'https://legacy.livepair.dev',
      themePreference: 'dark',
    });
    expect(useSettingsStore.getState().isReady).toBe(true);
    expect(useUiStore.getState().backendUrlDraft).toBe('https://legacy.livepair.dev');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(window.localStorage.getItem('livepair.backendUrl')).toBeNull();
    expect(window.localStorage.getItem('livepair.themePreference')).toBeNull();
  });

  it('leaves legacy localStorage values intact when hydration fails', async () => {
    window.localStorage.setItem('livepair.backendUrl', 'https://legacy.livepair.dev');
    window.bridge.migrateLegacySettings = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(bootstrapDesktopRenderer()).rejects.toThrow('boom');

    expect(window.localStorage.getItem('livepair.backendUrl')).toBe('https://legacy.livepair.dev');
  });
});
