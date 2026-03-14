import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { hydrateCurrentChat } from './chatMemory';
import { useSessionStore } from './store/sessionStore';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';

async function hydrateScreenCaptureSources(): Promise<void> {
  try {
    const snapshot = await window.bridge.listScreenCaptureSources();
    useSessionStore.getState().setScreenCaptureSourceSnapshot(snapshot);
  } catch (error: unknown) {
    useSessionStore.getState().setLastRuntimeError(
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Failed to load screen capture sources',
    );
  }
}

export async function bootstrapDesktopRenderer(): Promise<void> {
  const settings = await useSettingsStore.getState().hydrate();
  useUiStore.getState().initializeSettingsUi(settings);
  await Promise.all([
    useUiStore.getState().initializeDevicePreferences(),
    hydrateScreenCaptureSources(),
  ]);
  await hydrateCurrentChat();

  const mediaQueryList = window.matchMedia(THEME_MEDIA_QUERY);
  applyResolvedTheme(resolveThemePreference(settings.themePreference, mediaQueryList.matches));
}
