import { useEffect, useState } from 'react';
import { Ban, ChevronLeft, Mic, MicOff, Monitor, MonitorOff, PhoneOff } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type {
  ProductMode,
  ScreenCaptureState,
  SpeechLifecycleStatus,
  VoiceCaptureState,
} from '../../runtime/core/types';
import './ControlDock.css';

export type ControlDockProps = {
  currentMode: ProductMode;
  isVoiceSessionActive: boolean;
  speechLifecycleStatus: SpeechLifecycleStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  onStartVoiceSession: () => Promise<void>;
  onStartVoiceCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onStartScreenCapture: () => Promise<void>;
  onStopScreenCapture: () => Promise<void>;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  currentMode,
  isVoiceSessionActive,
  speechLifecycleStatus,
  voiceCaptureState,
  screenCaptureState,
  onStartVoiceSession,
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
  const isSpeechMode = currentMode === 'speech';
  const isVoiceCaptureBusy =
    voiceCaptureState === 'requestingPermission' || voiceCaptureState === 'stopping';
  const isVoiceCapturing = voiceCaptureState === 'capturing';
  const isVoiceSessionBusy =
    speechLifecycleStatus === 'starting' || speechLifecycleStatus === 'ending';
  const isMicrophoneAvailable =
    speechLifecycleStatus !== 'off' &&
    speechLifecycleStatus !== 'starting' &&
    speechLifecycleStatus !== 'ending';
  const isScreenContextBusy =
    screenCaptureState === 'requestingPermission' || screenCaptureState === 'stopping';
  const isScreenContextActive =
    screenCaptureState === 'ready' ||
    screenCaptureState === 'capturing' ||
    screenCaptureState === 'streaming';
  const isScreenContextAvailable = isMicrophoneAvailable;
  const micButtonClassName = [
    isVoiceCapturing ? 'control-dock__btn--active' : '',
    isVoiceCaptureBusy ? 'control-dock__btn--pending' : '',
  ].filter(Boolean).join(' ') || undefined;
  const screenButtonClassName = [
    isScreenContextActive ? 'control-dock__btn--active' : '',
    isScreenContextBusy ? 'control-dock__btn--pending' : '',
  ].filter(Boolean).join(' ') || undefined;
  const microphoneLabel = !isSpeechMode
    ? 'Switch to speech mode to use microphone'
    : !isMicrophoneAvailable
      ? 'Connect voice session to use microphone'
      : isVoiceCapturing
        ? 'Stop microphone capture'
        : voiceCaptureState === 'requestingPermission'
          ? 'Requesting microphone permission'
          : voiceCaptureState === 'stopping'
            ? 'Stopping microphone capture'
            : voiceCaptureState === 'error'
              ? 'Retry microphone capture'
              : 'Start microphone capture';
  const screenContextLabel = !isSpeechMode
    ? 'Switch to speech mode to use screen context'
    : !isScreenContextAvailable
      ? 'Connect voice session to use screen context'
      : isScreenContextActive
        ? 'Stop screen context'
        : screenCaptureState === 'requestingPermission'
          ? 'Requesting screen permission'
          : screenCaptureState === 'stopping'
            ? 'Stopping screen context'
            : screenCaptureState === 'error'
              ? 'Retry screen context'
              : 'Start screen context';
  const voiceSessionLabel = !isSpeechMode
    ? 'Switch to speech mode'
    : isVoiceSessionBusy
      ? speechLifecycleStatus === 'starting'
        ? 'Connecting voice session'
        : 'Stopping voice session'
      : isVoiceSessionActive
        ? 'Disconnect voice session'
        : 'Connect voice session';

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
      <IconButton
        label={microphoneLabel}
        className={micButtonClassName}
        disabled={!isSpeechMode || !isMicrophoneAvailable || isVoiceCaptureBusy}
        onClick={() => {
          if (!isSpeechMode || !isMicrophoneAvailable || isVoiceCaptureBusy) {
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
        disabled={!isSpeechMode || !isScreenContextAvailable || isScreenContextBusy}
        onClick={() => {
          if (!isSpeechMode || !isScreenContextAvailable || isScreenContextBusy) {
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

      <IconButton
        label={voiceSessionLabel}
        className={isVoiceSessionActive ? 'control-dock__btn--danger' : 'control-dock__btn--start'}
        disabled={isVoiceSessionBusy}
        onClick={() => {
          if (isVoiceSessionBusy) {
            return;
          }

          if (isVoiceSessionActive) {
            void onEndSession();
            return;
          }

          void onStartVoiceSession();
        }}
      >
        {isVoiceSessionActive ? <PhoneOff size={18} /> : <Ban size={18} />}
      </IconButton>

      <Divider orientation="horizontal" />

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
