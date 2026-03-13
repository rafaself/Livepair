import { create } from 'zustand';
import type {
  DesktopSettings,
  DesktopSettingsPatch,
} from '../../shared';
import { DEFAULT_DESKTOP_SETTINGS } from '../../shared';

type SettingsStoreState = {
  settings: DesktopSettings;
  isReady: boolean;
  hydrate: () => Promise<DesktopSettings>;
  updateSetting: <Key extends keyof DesktopSettings>(
    key: Key,
    value: DesktopSettings[Key],
  ) => Promise<DesktopSettings>;
  updateSettings: (patch: DesktopSettingsPatch) => Promise<DesktopSettings>;
  reset: () => void;
};

const defaultSettingsState = {
  settings: DEFAULT_DESKTOP_SETTINGS,
  isReady: false,
};

let pendingHydration: Promise<DesktopSettings> | null = null;

export const useSettingsStore = create<SettingsStoreState>((set, get) => ({
  ...defaultSettingsState,
  hydrate: async () => {
    if (get().isReady) {
      return get().settings;
    }

    if (pendingHydration !== null) {
      return pendingHydration;
    }

    pendingHydration = (async () => {
      try {
        const settings = await window.bridge.getSettings();

        set({
          settings,
          isReady: true,
        });

        return settings;
      } finally {
        pendingHydration = null;
      }
    })();

    return pendingHydration;
  },
  updateSetting: async (key, value) => {
    return get().updateSettings({ [key]: value } as DesktopSettingsPatch);
  },
  updateSettings: async (patch) => {
    const settings = await window.bridge.updateSettings(patch);
    set({ settings, isReady: true });
    return settings;
  },
  reset: () => {
    pendingHydration = null;
    set(defaultSettingsState);
  },
}));
