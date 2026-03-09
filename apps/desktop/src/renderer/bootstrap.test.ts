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
    window.bridge.listDisplays = vi.fn().mockResolvedValue([
      { id: 'display-2', label: 'Display 2', isPrimary: false },
    ]);
  });

  it('hydrates settings before render, applies the resolved theme, and seeds drafts from persisted settings', async () => {
    await bootstrapDesktopRenderer();

    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);
    expect(window.bridge.listDisplays).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().isReady).toBe(true);
    expect(useUiStore.getState().backendUrlDraft).toBe(DEFAULT_DESKTOP_SETTINGS.backendUrl);
    expect(useUiStore.getState().displayOptions).toEqual([
      { id: 'display-2', label: 'Display 2', isPrimary: false },
    ]);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
