import { useEffect, useState } from 'react';
import { ChevronLeft, Mic, MicOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { ProductMode } from '../../runtime/core/session.types';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';
import type { ScreenCaptureState } from '../../runtime/screen/screen.types';
import type { VoiceCaptureState } from '../../runtime/voice/voice.types';
import './ControlDock.css';

export type ControlDockProps = {
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  onStartVoiceCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onStartScreenCapture: () => Promise<void>;
  onStopScreenCapture: () => Promise<void>;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  currentMode,
  speechLifecycleStatus,
  voiceCaptureState,
  screenCaptureState,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onStartScreenCapture,
  onStopScreenCapture,
  onEndSession,
}: ControlDockProps): JSX.Element {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const closePanel = useUiStore((state) => state.closePanel);
  const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);

  const [isHovered, setIsHovered] = useState(false);
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.hasFocus());

  const shouldDimDock = !isPanelOpen && !isWindowFocused && !isHovered;
  const hasSpeechLifecycleActivity = speechLifecycleStatus !== 'off';
  const isSpeechModeActive = currentMode === 'speech' && hasSpeechLifecycleActivity;
  const isVoiceCaptureBusy =
    voiceCaptureState === 'requestingPermission' || voiceCaptureState === 'stopping';
  const isVoiceCapturing = voiceCaptureState === 'capturing';
  const isSpeechModeTransitioning =
    speechLifecycleStatus === 'starting' || speechLifecycleStatus === 'ending';
  const isMicrophoneAvailable = isSpeechModeActive && !isSpeechModeTransitioning;
  const isScreenContextBusy =
    screenCaptureState === 'requestingPermission' || screenCaptureState === 'stopping';
  const isScreenContextActive =
    screenCaptureState === 'ready' ||
    screenCaptureState === 'capturing' ||
    screenCaptureState === 'streaming';
  const isScreenContextAvailable = isSpeechModeActive && !isSpeechModeTransitioning;
  const showSpeechControls = isSpeechModeActive;
  const showEndSpeechModeControl = showSpeechControls && !isPanelOpen;
  const micButtonClassName = [
    isVoiceCapturing ? 'control-dock__btn--active' : '',
    isVoiceCaptureBusy ? 'control-dock__btn--pending' : '',
  ].filter(Boolean).join(' ') || undefined;
  const screenButtonClassName = [
    isScreenContextActive ? 'control-dock__btn--active' : '',
    isScreenContextBusy ? 'control-dock__btn--pending' : '',
  ].filter(Boolean).join(' ') || undefined;
  const microphoneLabel = speechLifecycleStatus === 'starting'
    ? 'Speech mode is starting'
    : speechLifecycleStatus === 'ending'
      ? 'Speech mode is ending'
      : !isMicrophoneAvailable
        ? 'Microphone unavailable outside active speech mode'
        : isVoiceCapturing
          ? 'Stop microphone capture'
          : voiceCaptureState === 'requestingPermission'
            ? 'Requesting microphone permission'
            : voiceCaptureState === 'stopping'
              ? 'Stopping microphone capture'
              : voiceCaptureState === 'error'
                ? 'Retry microphone capture'
                : 'Start microphone capture';
  const screenContextLabel = speechLifecycleStatus === 'starting'
    ? 'Screen context unavailable while speech mode starts'
    : speechLifecycleStatus === 'ending'
      ? 'Screen context unavailable while speech mode ends'
      : !isScreenContextAvailable
        ? 'Screen context unavailable outside active speech mode'
        : isScreenContextActive
          ? 'Stop screen context'
          : screenCaptureState === 'requestingPermission'
            ? 'Requesting screen permission'
            : screenCaptureState === 'stopping'
              ? 'Stopping screen context'
              : screenCaptureState === 'error'
                ? 'Retry screen context'
                : 'Start screen context';
  const endSpeechModeLabel = speechLifecycleStatus === 'starting'
    ? 'Starting speech mode'
    : speechLifecycleStatus === 'ending'
      ? 'Ending speech mode'
      : 'End speech mode';

  useEffect(() => {
    const handleWindowFocus = (): void => {
      setIsWindowFocused(true);
    };

    const handleWindowBlur = (): void => {
      setIsWindowFocused(false);
      if (isPanelOpen && !isPanelPinned) {
        closePanel();
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);

    return () => {
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [closePanel, isPanelOpen, isPanelPinned]);

  return (
    <div
      className={`control-dock${isPanelOpen ? ' control-dock--panel-open' : ''}${shouldDimDock ? ' control-dock--dimmed' : ''}`}
      role="toolbar"
      aria-label="Assistant controls"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {showSpeechControls ? (
        <>
          <IconButton
            label={microphoneLabel}
            className={micButtonClassName}
            disabled={!isMicrophoneAvailable || isVoiceCaptureBusy}
            onClick={() => {
              if (!isMicrophoneAvailable || isVoiceCaptureBusy) {
                return;
              }

              if (isVoiceCapturing) {
                void onStopVoiceCapture();
                return;
              }

              void onStartVoiceCapture();
            }}
          >
            {isVoiceCapturing ? <Mic size={18} /> : <MicOff size={18} />}
          </IconButton>

          <IconButton
            label={screenContextLabel}
            className={screenButtonClassName}
            disabled={!isScreenContextAvailable || isScreenContextBusy}
            onClick={() => {
              if (!isScreenContextAvailable || isScreenContextBusy) {
                return;
              }

              if (isScreenContextActive) {
                void onStopScreenCapture();
                return;
              }

              void onStartScreenCapture();
            }}
          >
            {isScreenContextActive ? <Monitor size={18} /> : <MonitorOff size={18} />}
          </IconButton>

          {showEndSpeechModeControl ? (
            <IconButton
              label={endSpeechModeLabel}
              className="control-dock__btn--danger"
              disabled={isSpeechModeTransitioning}
              onClick={() => {
                if (isSpeechModeTransitioning) {
                  return;
                }

                void onEndSession();
              }}
            >
              <PhoneOff size={18} />
            </IconButton>
          ) : null}

          <Divider orientation="horizontal" />
        </>
      ) : null}

      <IconButton
        label={isPanelOpen ? 'Close panel' : 'Open panel'}
        className={`control-dock__panel-btn${isPanelOpen ? ' control-dock__btn--active' : ''}`}
        aria-controls="assistant-panel"
        aria-expanded={isPanelOpen}
        onClick={togglePanel}
      >
        <ChevronLeft size={18} />
      </IconButton>
    </div>
  );
}
