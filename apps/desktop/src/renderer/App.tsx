import { useEffect, useRef } from 'react';
import { AssistantPanel } from './components/features/assistant-panel/AssistantPanel';
import { ControlDock } from './components/composite/ControlDock';
import { useCaptureExclusionRects } from './hooks/useCaptureExclusionRects';
import { useOverlayHitRegions } from './hooks/useOverlayHitRegions';
import { useOverlayPointerPassthrough } from './hooks/useOverlayPointerPassthrough';
import type { OverlayMode } from '../shared';
import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { useSettingsStore } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';
import { useSessionRuntime } from './runtime';
import { SnackbarProvider, useSnackbar } from './components/primitives';

function LinuxOverlayInteraction(): null {
  useOverlayHitRegions();
  return null;
}

function CaptureExclusionRectSync(): null {
  useCaptureExclusionRects();
  return null;
}

function ForwardedPointerOverlayInteraction(): null {
  useOverlayPointerPassthrough();
  return null;
}

function OverlayInteractionManager({
  overlayMode,
}: {
  overlayMode: OverlayMode;
}): JSX.Element | null {
  if (overlayMode === 'linux-shape') {
    return <LinuxOverlayInteraction />;
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
    currentMode,
    activeTransport,
    speechLifecycleStatus,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
    handleStartVoiceCapture,
    handleStopVoiceCapture,
    handleStartScreenCapture,
    handleStopScreenCapture,
    handleAnalyzeScreenNow,
    handleEndSpeechMode,
  } = useSessionRuntime();

  return (
    <div className="app-shell">
      <ThemePreferenceSync />
      <CaptureExclusionRectSync />
      <OverlayInteractionManager overlayMode={overlayMode} />
      <AssistantPanel />
      <ControlDock
        currentMode={currentMode}
        speechLifecycleStatus={speechLifecycleStatus}
        activeTransport={activeTransport}
        voiceSessionStatus={voiceSessionStatus}
        voiceCaptureState={voiceCaptureState}
        screenCaptureState={screenCaptureState}
        onStartVoiceCapture={handleStartVoiceCapture}
        onStopVoiceCapture={handleStopVoiceCapture}
        onStartScreenCapture={handleStartScreenCapture}
        onStopScreenCapture={handleStopScreenCapture}
        onAnalyzeScreenNow={handleAnalyzeScreenNow}
        onEndSession={handleEndSpeechMode}
      />
    </div>
  );
}

export function App(): JSX.Element {
  return (
    <SnackbarProvider>
      <RuntimeSnackbarObserver />
      <AppShell />
    </SnackbarProvider>
  );
}

function formatRuntimeSnackbarMessage(detail: string): string {
  const normalizedDetail = detail.trim().toLowerCase();

  if (
    normalizedDetail.includes('microphone permission was denied')
    || normalizedDetail.includes('microphone permission')
  ) {
    return 'Microphone blocked. Check permissions and try again.';
  }

  if (normalizedDetail.includes('no microphone device is available')) {
    return 'No microphone available. Check your mic and try again.';
  }

  if (
    normalizedDetail.includes('screen capture permission was denied')
    || normalizedDetail.includes('screen recording permission')
    || normalizedDetail.includes('screen recording is restricted')
  ) {
    return 'Screen sharing blocked. Check permissions and try again.';
  }

  if (
    normalizedDetail.includes('no screen source could be selected')
    || normalizedDetail.includes('no screen or window sources are available')
  ) {
    return 'Choose a screen to share, then try again.';
  }

  if (normalizedDetail.includes('screen context requires an active live session')) {
    return 'Start Live session before sharing your screen.';
  }

  if (
    normalizedDetail.includes('token refresh failed')
    || normalizedDetail.includes('resume handle unavailable')
    || normalizedDetail.includes('session marked non-resumable')
    || normalizedDetail.includes('failed to resume voice session')
    || normalizedDetail.includes('voice session token was unavailable for fallback')
    || normalizedDetail.includes('persisted live session')
  ) {
    return 'Live session expired. Start again.';
  }

  if (
    normalizedDetail === 'token failed'
    || normalizedDetail.includes('failed to request voice session token')
    || normalizedDetail.includes('failed to connect voice session')
    || normalizedDetail.includes('backend health check failed')
  ) {
    return "Couldn't start Live session. Try again.";
  }

  return detail;
}

function RuntimeSnackbarObserver(): null {
  const lastRuntimeError = useSessionStore((state) => state.lastRuntimeError);
  const voiceSessionResumptionStatus = useSessionStore(
    (state) => state.voiceSessionResumption.status,
  );
  const { showError, showSnackbar } = useSnackbar();
  const previousResumptionStatusRef = useRef(voiceSessionResumptionStatus);
  const recoveryNoticePendingRef = useRef(false);

  useEffect(() => {
    if (lastRuntimeError) {
      showError(formatRuntimeSnackbarMessage(lastRuntimeError));
    }
  }, [lastRuntimeError, showError]);

  useEffect(() => {
    const previousStatus = previousResumptionStatusRef.current;

    if (voiceSessionResumptionStatus === previousStatus) {
      return;
    }

    if (voiceSessionResumptionStatus === 'reconnecting') {
      recoveryNoticePendingRef.current = true;
      showSnackbar('Reconnecting Live session...', 'warning');
    } else if (voiceSessionResumptionStatus === 'resumed' && recoveryNoticePendingRef.current) {
      recoveryNoticePendingRef.current = false;
      showSnackbar('Live session reconnected', 'success');
    } else if (voiceSessionResumptionStatus === 'connected' && recoveryNoticePendingRef.current) {
      recoveryNoticePendingRef.current = false;
      showSnackbar('Live session restarted', 'info');
    } else if (
      voiceSessionResumptionStatus === 'idle'
      || voiceSessionResumptionStatus === 'resumeFailed'
    ) {
      recoveryNoticePendingRef.current = false;
    }

    previousResumptionStatusRef.current = voiceSessionResumptionStatus;
  }, [voiceSessionResumptionStatus, showSnackbar]);

  return null;
}
