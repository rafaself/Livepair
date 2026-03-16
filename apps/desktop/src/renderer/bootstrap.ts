import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { hydrateCurrentChatIfPresent } from './chatMemory';
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

function waitForFirstPaint(): Promise<void> {
  const scheduleAnimationFrame = window.requestAnimationFrame?.bind(window);

  if (!scheduleAnimationFrame) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, 0);
    });
  }

  return new Promise((resolve) => {
    scheduleAnimationFrame(() => {
      scheduleAnimationFrame(() => {
        resolve();
      });
    });
  });
}

async function hydrateDeferredRendererState(): Promise<void> {
  await Promise.all([
    useUiStore.getState().initializeDevicePreferences(),
    hydrateScreenCaptureSources(),
    hydrateCurrentChatIfPresent(),
  ]);
}

export async function bootstrapDesktopRenderer(): Promise<void> {
  const settings = await useSettingsStore.getState().hydrate();

  const mediaQueryList = window.matchMedia(THEME_MEDIA_QUERY);
  applyResolvedTheme(resolveThemePreference(settings.themePreference, mediaQueryList.matches));

  await waitForFirstPaint();
  await hydrateDeferredRendererState();
}
