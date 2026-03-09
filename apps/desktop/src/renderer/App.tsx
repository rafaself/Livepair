import { useEffect } from 'react';
import { AssistantPanel } from './components/features/AssistantPanel';
import { ControlDock } from './components/composite/ControlDock';
import { useOverlayHitRegions } from './hooks/useOverlayHitRegions';
import { useOverlayPointerPassthrough } from './hooks/useOverlayPointerPassthrough';
import type { OverlayMode } from '../shared/desktopBridge';
import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { useSettingsStore } from './store/settingsStore';
import { useUiStore } from './store/uiStore';
import { useSessionRuntime } from './runtime/useSessionRuntime';

function LinuxOverlayInteraction(): null {
  useOverlayHitRegions();
  return null;
}

function ForwardedPointerOverlayInteraction(): null {
  useOverlayPointerPassthrough();
  return null;
}

function LinuxOverlayFocusabilitySync(): null {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);

  useEffect(() => {
    void window.bridge?.setOverlayFocusable(isPanelOpen);
  }, [isPanelOpen]);

  return null;
}

function OverlayInteractionManager({
  overlayMode,
}: {
  overlayMode: OverlayMode;
}): JSX.Element | null {
  if (overlayMode === 'linux-shape') {
    return (
      <>
        <LinuxOverlayInteraction />
        <LinuxOverlayFocusabilitySync />
      </>
    );
  }

  return <ForwardedPointerOverlayInteraction />;
}

function ThemePreferenceSync(): null {
  const themePreference = useSettingsStore((state) => state.settings.themePreference);

  useEffect(() => {
    if (themePreference !== 'system') {
      applyResolvedTheme(resolveThemePreference(themePreference));
      return;
    }

    const mediaQueryList = window.matchMedia(THEME_MEDIA_QUERY);
    applyResolvedTheme(resolveThemePreference(themePreference, mediaQueryList.matches));

    const handleChange = (event: MediaQueryListEvent): void => {
      applyResolvedTheme(resolveThemePreference(themePreference, event.matches));
    };

    mediaQueryList.addEventListener('change', handleChange);

    return () => {
      mediaQueryList.removeEventListener('change', handleChange);
    };
  }, [themePreference]);

  return null;
}

function AppShell(): JSX.Element {
  const overlayMode = window.bridge?.overlayMode ?? 'linux-shape';
  const {
    isSessionActive,
    handleStartSession,
    handleEndSession,
  } = useSessionRuntime();

  return (
    <div className="app-shell">
      <ThemePreferenceSync />
      <OverlayInteractionManager overlayMode={overlayMode} />
      <AssistantPanel showStateDevControls={import.meta.env.DEV} />
      <ControlDock
        isSessionActive={isSessionActive}
        onStartSession={handleStartSession}
        onEndSession={handleEndSession}
      />
    </div>
  );
}

export function App(): JSX.Element {
  return <AppShell />;
}
