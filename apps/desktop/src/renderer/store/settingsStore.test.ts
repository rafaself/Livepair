import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DESKTOP_SETTINGS,
  DEFAULT_SYSTEM_INSTRUCTION,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
} from '../../shared/settings';
import { resetDesktopStores } from '../test/store';
import { useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    resetDesktopStores();
    window.bridge.getSettings = vi.fn().mockResolvedValue(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.updateSettings = vi.fn().mockImplementation(async (patch) => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      ...patch,
    }));
  });

  it('hydrates once and marks the store ready from persisted settings', async () => {
    await expect(useSettingsStore.getState().hydrate()).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);

    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);
    expect(useSettingsStore.getState().isReady).toBe(true);

    await useSettingsStore.getState().hydrate();
    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);
  });

  it('deduplicates concurrent hydrate calls while initialization is still in flight', async () => {
    let resolveHydration: ((value: typeof DEFAULT_DESKTOP_SETTINGS) => void) | null = null;
    window.bridge.getSettings = vi.fn().mockImplementation(
      () =>
        new Promise((resolve: (value: typeof DEFAULT_DESKTOP_SETTINGS) => void) => {
          resolveHydration = resolve;
        }),
    );

    const firstHydration = useSettingsStore.getState().hydrate();
    const secondHydration = useSettingsStore.getState().hydrate();

    expect(window.bridge.getSettings).toHaveBeenCalledTimes(1);

    expect(resolveHydration).not.toBeNull();
    resolveHydration!(DEFAULT_DESKTOP_SETTINGS);

    await expect(firstHydration).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);
    await expect(secondHydration).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);
    expect(useSettingsStore.getState().isReady).toBe(true);
  });

  it('updates a single persisted setting through the bridge without touching localStorage', async () => {
    await useSettingsStore.getState().hydrate();
    await expect(useSettingsStore.getState().updateSetting('themePreference', 'dark')).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      themePreference: 'dark',
    });

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ themePreference: 'dark' });
    expect(useSettingsStore.getState().settings.themePreference).toBe('dark');
  });

  it('hydrates and updates persisted voice preferences through the bridge', async () => {
    window.bridge.getSettings = vi.fn().mockResolvedValue({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
      voice: 'Kore',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
    window.bridge.updateSettings = vi.fn().mockImplementation(async (patch) => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
      voice: 'Kore',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
      ...patch,
    }));

    await expect(useSettingsStore.getState().hydrate()).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
      voice: 'Kore',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
    await expect(useSettingsStore.getState().updateSetting('voice', 'Aoede')).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
      voice: 'Aoede',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ voice: 'Aoede' });
    expect(useSettingsStore.getState().settings.voice).toBe('Aoede');
    expect(useSettingsStore.getState().settings.systemInstruction).toBe(
      DEFAULT_SYSTEM_INSTRUCTION,
    );
  });

  it('hydrates and updates grounding preferences through the bridge', async () => {
    window.bridge.getSettings = vi.fn().mockResolvedValue({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
    });
    window.bridge.updateSettings = vi.fn().mockImplementation(async (patch) => ({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
      ...patch,
    }));

    await expect(useSettingsStore.getState().hydrate()).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      groundingEnabled: false,
    });
    await expect(
      useSettingsStore.getState().updateSetting('groundingEnabled', true),
    ).resolves.toEqual(DEFAULT_DESKTOP_SETTINGS);

    expect(window.bridge.updateSettings).toHaveBeenCalledWith({ groundingEnabled: true });
    expect(useSettingsStore.getState().settings.groundingEnabled).toBe(true);
  });

  it('normalizes malformed Gemini preferences returned by the bridge before exposing them', async () => {
    window.bridge.getSettings = vi.fn().mockResolvedValue({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'InvalidVoice',
      systemInstruction: '   ',
    });

    await expect(useSettingsStore.getState().hydrate()).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'Puck',
      systemInstruction: DEFAULT_SYSTEM_INSTRUCTION,
    });
  });

  it('normalizes overlong instruction updates returned by the bridge', async () => {
    window.bridge.updateSettings = vi.fn().mockResolvedValue({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'Kore',
      systemInstruction: `  ${'x'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH + 20)}  `,
    });

    await expect(
      useSettingsStore.getState().updateSettings({
        systemInstruction: '  draft instruction  ',
      }),
    ).resolves.toEqual({
      ...DEFAULT_DESKTOP_SETTINGS,
      voice: 'Kore',
      systemInstruction: 'x'.repeat(MAX_SYSTEM_INSTRUCTION_LENGTH),
    });
  });
});
