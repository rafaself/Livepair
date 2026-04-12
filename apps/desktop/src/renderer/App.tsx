import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantPanel } from './components/features/assistant-panel/AssistantPanel';
import { ControlDock, ShareScreenModeDialog, type ConfiguredScreenContextMode } from './components/composite';
import { useCaptureExclusionRects } from './hooks/useCaptureExclusionRects';
import { useOverlayHitRegions } from './hooks/useOverlayHitRegions';
import { useOverlayPointerPassthrough } from './hooks/useOverlayPointerPassthrough';
import type { OverlayMode } from '../shared';
import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { useSettingsStore } from './store/settingsStore';
import { useLiveRuntimeSessionSnapshot, useSessionRuntime } from './runtime/liveRuntime';
import { SnackbarProvider, useSnackbar } from './components/primitives';

type PendingShareIntent = 'start-screen-capture' | 'start-speech-with-screen-share';

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
  const screenContextMode = useSettingsStore((state) => state.settings.screenContextMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const overlayMode = window.bridge?.overlayMode ?? 'linux-shape';
  const {
    controlGatingSnapshot,
    speechLifecycleStatus,
    voiceCaptureState,
    screenCaptureState,
    handleStartVoiceCapture,
    handleStopVoiceCapture,
    handleStartScreenCapture,
    handleStopScreenCapture,
    handleSendScreenNow,
    handleEndSpeechMode,
    handleStartSpeechModeWithScreenShare,
    handleReportRuntimeError,
  } = useSessionRuntime();
  const pendingShareIntentRef = useRef<PendingShareIntent | null>(null);
  const [isShareScreenDialogOpen, setIsShareScreenDialogOpen] = useState(false);
  const [selectedScreenContextMode, setSelectedScreenContextMode] =
    useState<ConfiguredScreenContextMode | null>(null);
  const [isSavingScreenContextMode, setIsSavingScreenContextMode] = useState(false);

  const handleShareActionWithGate = useCallback(async (
    intent: PendingShareIntent,
    shareAction: () => Promise<void>,
  ): Promise<boolean> => {
    if (screenContextMode === 'unconfigured') {
      pendingShareIntentRef.current = intent;
      setSelectedScreenContextMode(null);
      setIsShareScreenDialogOpen(true);
      return false;
    }

    await shareAction();
    return true;
  }, [screenContextMode]);

  const handleStartScreenCaptureWithGate = useCallback(async (): Promise<void> => {
    await handleShareActionWithGate('start-screen-capture', handleStartScreenCapture);
  }, [handleShareActionWithGate, handleStartScreenCapture]);

  const handleConfirmScreenContextMode = useCallback(async (): Promise<void> => {
    if (selectedScreenContextMode === null || isSavingScreenContextMode) {
      return;
    }

    setIsSavingScreenContextMode(true);

    try {
      await updateSetting('screenContextMode', selectedScreenContextMode);
      setIsShareScreenDialogOpen(false);

      const pendingShareIntent = pendingShareIntentRef.current;
      pendingShareIntentRef.current = null;

      if (pendingShareIntent === 'start-screen-capture') {
        await handleStartScreenCapture();
      } else if (pendingShareIntent === 'start-speech-with-screen-share') {
        await handleStartSpeechModeWithScreenShare();
      }
    } catch (error) {
      handleReportRuntimeError(
        error instanceof Error && error.message.length > 0
          ? error.message
          : 'Failed to save Share Screen mode',
      );
    } finally {
      setIsSavingScreenContextMode(false);
    }
  }, [
    isSavingScreenContextMode,
    selectedScreenContextMode,
    handleReportRuntimeError,
    handleStartScreenCapture,
    handleStartSpeechModeWithScreenShare,
    updateSetting,
  ]);

  const handleCancelScreenContextMode = useCallback((): void => {
    pendingShareIntentRef.current = null;
    setSelectedScreenContextMode(null);
    setIsShareScreenDialogOpen(false);
  }, []);

  return (
    <div className="app-shell">
      <ThemePreferenceSync />
      <CaptureExclusionRectSync />
      <OverlayInteractionManager overlayMode={overlayMode} />
      <ShareScreenModeDialog
        isOpen={isShareScreenDialogOpen}
        isSaving={isSavingScreenContextMode}
        selectedMode={selectedScreenContextMode}
        onConfirm={handleConfirmScreenContextMode}
        onCancel={handleCancelScreenContextMode}
        onSelectMode={setSelectedScreenContextMode}
      />
      <AssistantPanel
        screenShareModeGate={(shareAction) =>
          handleShareActionWithGate('start-speech-with-screen-share', shareAction)}
      />
      <ControlDock
        controlGatingSnapshot={controlGatingSnapshot}
        speechLifecycleStatus={speechLifecycleStatus}
        voiceCaptureState={voiceCaptureState}
        screenCaptureState={screenCaptureState}
        onStartVoiceCapture={handleStartVoiceCapture}
        onStopVoiceCapture={handleStopVoiceCapture}
        onStartScreenCapture={handleStartScreenCaptureWithGate}
        onStopScreenCapture={handleStopScreenCapture}
        onSendScreenNow={handleSendScreenNow}
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

  if (normalizedDetail.includes('screen sharing requires an active live session')) {
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
  const {
    lastRuntimeError,
    voiceSessionResumptionStatus,
  } = useLiveRuntimeSessionSnapshot();
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
