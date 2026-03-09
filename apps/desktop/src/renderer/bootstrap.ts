import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

export async function bootstrapDesktopRenderer(): Promise<void> {
  const settings = await useSettingsStore.getState().hydrate();
  useUiStore.getState().initializeSettingsUi(settings);
  await useUiStore.getState().initializeDevicePreferences();

  const mediaQueryList = window.matchMedia(THEME_MEDIA_QUERY);
  applyResolvedTheme(resolveThemePreference(settings.themePreference, mediaQueryList.matches));
}
