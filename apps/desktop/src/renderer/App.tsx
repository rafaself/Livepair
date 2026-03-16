import { useCallback, useEffect, useRef, useState } from 'react';
import { AssistantPanel } from './components/features/assistant-panel/AssistantPanel';
import { ControlDock } from './components/composite/ControlDock';
import { useCaptureExclusionRects } from './hooks/useCaptureExclusionRects';
import { useOverlayHitRegions } from './hooks/useOverlayHitRegions';
import { useOverlayPointerPassthrough } from './hooks/useOverlayPointerPassthrough';
import type { OverlayMode, ScreenContextMode } from '../shared';
import { applyResolvedTheme, resolveThemePreference, THEME_MEDIA_QUERY } from './theme';
import { useSettingsStore } from './store/settingsStore';
import { useSessionStore } from './store/sessionStore';
import { useSessionRuntime } from './runtime';
import { Button, SnackbarProvider, useSnackbar } from './components/primitives';

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

type ConfiguredScreenContextMode = Exclude<ScreenContextMode, 'unconfigured'>;

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => {
    return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true';
  });
}

function ShareScreenModeDialog({
  isOpen,
  isSaving,
  selectedMode,
  onConfirm,
  onSelectMode,
}: {
  isOpen: boolean;
  isSaving: boolean;
  selectedMode: ConfiguredScreenContextMode | null;
  onConfirm: () => Promise<void>;
  onSelectMode: (mode: ConfiguredScreenContextMode) => void;
}): JSX.Element | null {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    const focusInitialElement = (): void => {
      const focusableElements = getFocusableElements(dialog);
      const firstFocusableElement = focusableElements[0] ?? dialog;
      firstFocusableElement.focus();
    };

    focusInitialElement();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') {
        if (event.key === 'Escape') {
          event.preventDefault();
        }
        return;
      }

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstFocusableElement = focusableElements[0];
      const lastFocusableElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault();
        lastFocusableElement?.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault();
        firstFocusableElement?.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="screen-context-dialog-backdrop">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-screen-mode-title"
        aria-describedby="share-screen-mode-description"
        className="screen-context-dialog"
        tabIndex={-1}
      >
        <div className="screen-context-dialog__header">
          <h2 id="share-screen-mode-title" className="screen-context-dialog__title">
            Choose your Share Screen mode
          </h2>
          <p id="share-screen-mode-description" className="screen-context-dialog__description">
            Before you start sharing, choose how Livepair should send your screen.
          </p>
        </div>

        <div className="screen-context-dialog__options" role="radiogroup" aria-label="Share Screen mode">
          <label
            className={`screen-context-dialog__option${selectedMode === 'manual' ? ' screen-context-dialog__option--selected' : ''}`}
          >
            <input
              type="radio"
              name="share-screen-mode"
              value="manual"
              checked={selectedMode === 'manual'}
              onChange={() => {
                onSelectMode('manual');
              }}
            />
              <span className="screen-context-dialog__option-copy">
                <span className="screen-context-dialog__option-title">Manual</span>
                <span className="screen-context-dialog__option-description">
                  Sends your current screen only when you explicitly click the manual send button.
                </span>
              </span>
            </label>

          <label
            className={`screen-context-dialog__option${selectedMode === 'continuous' ? ' screen-context-dialog__option--selected' : ''}`}
          >
            <input
              type="radio"
              name="share-screen-mode"
              value="continuous"
              checked={selectedMode === 'continuous'}
              onChange={() => {
                onSelectMode('continuous');
              }}
            />
            <span className="screen-context-dialog__option-copy">
              <span className="screen-context-dialog__option-title">Continuous</span>
              <span className="screen-context-dialog__option-description">
                Sends automatically every 3 seconds, with temporary 1 second bursts on meaningful
                changes.
              </span>
            </span>
          </label>
        </div>

        <div className="screen-context-dialog__actions">
          <Button
            aria-label="Confirm Share Screen mode"
            disabled={selectedMode === null || isSaving}
            onClick={() => {
              void onConfirm();
            }}
          >
            {isSaving ? 'Saving…' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AppShell(): JSX.Element {
  const screenContextMode = useSettingsStore((state) => state.settings.screenContextMode);
  const updateSetting = useSettingsStore((state) => state.updateSetting);
  const setLastRuntimeError = useSessionStore((state) => state.setLastRuntimeError);
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
    handleSendScreenNow,
    handleEndSpeechMode,
  } = useSessionRuntime();
  const pendingShareActionRef = useRef<(() => Promise<void>) | null>(null);
  const [isShareScreenDialogOpen, setIsShareScreenDialogOpen] = useState(false);
  const [selectedScreenContextMode, setSelectedScreenContextMode] =
    useState<ConfiguredScreenContextMode | null>(null);
  const [isSavingScreenContextMode, setIsSavingScreenContextMode] = useState(false);

  const handleStartScreenCaptureWithGate = useCallback(async (): Promise<void> => {
    if (screenContextMode === 'unconfigured') {
      pendingShareActionRef.current = handleStartScreenCapture;
      setSelectedScreenContextMode(null);
      setIsShareScreenDialogOpen(true);
      return;
    }

    await handleStartScreenCapture();
  }, [handleStartScreenCapture, screenContextMode]);

  const handleConfirmScreenContextMode = useCallback(async (): Promise<void> => {
    if (selectedScreenContextMode === null || isSavingScreenContextMode) {
      return;
    }

    setIsSavingScreenContextMode(true);

    try {
      await updateSetting('screenContextMode', selectedScreenContextMode);
      setIsShareScreenDialogOpen(false);

      const pendingShareAction = pendingShareActionRef.current;
      pendingShareActionRef.current = null;

      if (pendingShareAction !== null) {
        await pendingShareAction();
      }
    } catch (error) {
      setLastRuntimeError(
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
    setLastRuntimeError,
    updateSetting,
  ]);

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
        onSelectMode={setSelectedScreenContextMode}
      />
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
