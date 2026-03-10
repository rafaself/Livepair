import { useEffect, useRef, type RefObject } from 'react';
import { AssistantPanel } from './components/features/AssistantPanel';
import { ControlDock } from './components/composite/ControlDock';
import { useDismissableLayer } from './hooks/useDismissableLayer';
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

function LinuxOverlayWindowStateSync({
  dockRef,
  panelRef,
}: {
  dockRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLElement | null>;
}): null {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const overlayWindowState = useUiStore((state) => state.overlayWindowState);
  const setOverlayWindowState = useUiStore((state) => state.setOverlayWindowState);
  const closePanel = useUiStore((state) => state.closePanel);
  const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);

  useDismissableLayer({
    enabled: isPanelOpen && !isPanelPinned,
    containerRef: dockRef,
    extraRefs: [panelRef],
    containsTarget: (target) => {
      return target instanceof Element && target.closest('.floating-layer') !== null;
    },
    onDismiss: closePanel,
  });

  useEffect(() => {
    let isActive = true;

    void window.bridge
      ?.getOverlayWindowState()
      .then((state) => {
        if (!isActive) {
          return;
        }

        setOverlayWindowState(state);
      })
      .catch(() => undefined);

    const unsubscribe = window.bridge?.onOverlayWindowState((state) => {
      if (!isActive) {
        return;
      }

      setOverlayWindowState(state);
    });

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, [setOverlayWindowState]);

  useEffect(() => {
    void window.bridge?.setOverlayInteractive(isPanelOpen);
  }, [isPanelOpen]);

  useEffect(() => {
    if (
      overlayWindowState.isFocused ||
      !overlayWindowState.isInteractive ||
      !isPanelOpen ||
      isPanelPinned
    ) {
      return;
    }

    closePanel();
  }, [
    closePanel,
    isPanelOpen,
    isPanelPinned,
    overlayWindowState.isFocused,
    overlayWindowState.isInteractive,
  ]);

  return null;
}

function OverlayInteractionManager({
  overlayMode,
  dockRef,
  panelRef,
}: {
  overlayMode: OverlayMode;
  dockRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLElement | null>;
}): JSX.Element | null {
  if (overlayMode === 'linux-shape') {
    return (
      <>
        <LinuxOverlayInteraction />
        <LinuxOverlayWindowStateSync dockRef={dockRef} panelRef={panelRef} />
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
  const dockRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const {
    isSessionActive,
    handleStartSession,
    handleEndSession,
  } = useSessionRuntime();

  return (
    <div className="app-shell">
      <ThemePreferenceSync />
      <OverlayInteractionManager
        overlayMode={overlayMode}
        dockRef={dockRef}
        panelRef={panelRef}
      />
      <AssistantPanel showStateDevControls={import.meta.env.DEV} panelRef={panelRef} />
      <ControlDock
        dockRef={dockRef}
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
