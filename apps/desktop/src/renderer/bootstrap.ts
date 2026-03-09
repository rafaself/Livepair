import {
  DESKTOP_SETTINGS_STORAGE_KEYS,
  type LegacySettingsSnapshot,
} from '../shared/settings';
import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

function getLegacySettingsSnapshot(): LegacySettingsSnapshot {
  const snapshot: LegacySettingsSnapshot = {};
  const backendUrl = window.localStorage.getItem(DESKTOP_SETTINGS_STORAGE_KEYS.backendUrl);
  const themePreference = window.localStorage.getItem(
    DESKTOP_SETTINGS_STORAGE_KEYS.themePreference,
  );
  const selectedInputDeviceId = window.localStorage.getItem(
    DESKTOP_SETTINGS_STORAGE_KEYS.selectedInputDeviceId,
  );
  const selectedOutputDeviceId = window.localStorage.getItem(
    DESKTOP_SETTINGS_STORAGE_KEYS.selectedOutputDeviceId,
  );

  if (backendUrl !== null) {
    snapshot.backendUrl = backendUrl;
  }
  if (themePreference !== null) {
    snapshot.themePreference = themePreference;
  }
  if (selectedInputDeviceId !== null) {
    snapshot.selectedInputDeviceId = selectedInputDeviceId;
  }
  if (selectedOutputDeviceId !== null) {
    snapshot.selectedOutputDeviceId = selectedOutputDeviceId;
  }

  return snapshot;
}

function clearLegacySettings(snapshot: LegacySettingsSnapshot): void {
  if (snapshot.backendUrl !== undefined) {
    window.localStorage.removeItem(DESKTOP_SETTINGS_STORAGE_KEYS.backendUrl);
  }
  if (snapshot.themePreference !== undefined) {
    window.localStorage.removeItem(DESKTOP_SETTINGS_STORAGE_KEYS.themePreference);
  }
  if (snapshot.selectedInputDeviceId !== undefined) {
    window.localStorage.removeItem(DESKTOP_SETTINGS_STORAGE_KEYS.selectedInputDeviceId);
  }
  if (snapshot.selectedOutputDeviceId !== undefined) {
    window.localStorage.removeItem(DESKTOP_SETTINGS_STORAGE_KEYS.selectedOutputDeviceId);
  }
}

export async function bootstrapDesktopRenderer(): Promise<void> {
  const legacySnapshot = getLegacySettingsSnapshot();
  const settings = await useSettingsStore.getState().hydrate(legacySnapshot);
  useUiStore.getState().initializeSettingsUi(settings);
  await useUiStore.getState().initializeDevicePreferences();

  const mediaQueryList = window.matchMedia(THEME_MEDIA_QUERY);
  applyResolvedTheme(resolveThemePreference(settings.themePreference, mediaQueryList.matches));

  clearLegacySettings(legacySnapshot);
}
