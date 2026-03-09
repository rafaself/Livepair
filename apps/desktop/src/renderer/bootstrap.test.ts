import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { bootstrapDesktopRenderer } from './bootstrap';
import { resetDesktopStores } from './store/testing';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

describe('bootstrapDesktopRenderer', () => {
  beforeEach(() => {
    resetDesktopStores();
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
  });

  it('hydrates settings before render, applies the resolved theme, and seeds drafts from persisted settings', async () => {
    await bootstrapDesktopRenderer();

    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().isReady).toBe(true);
    expect(useUiStore.getState().backendUrlDraft).toBe(DEFAULT_DESKTOP_SETTINGS.backendUrl);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
