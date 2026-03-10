import { useEffect, useState } from 'react';
import { Ban, ChevronLeft, Mic, MicOff, MonitorOff, PhoneOff } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { VoiceCaptureState, VoiceSessionStatus } from '../../runtime/types';
import './ControlDock.css';

export type ControlDockProps = {
  isTextSessionActive: boolean;
  isVoiceSessionActive: boolean;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  onStartVoiceSession: () => Promise<void>;
  onStartVoiceCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  isTextSessionActive,
  isVoiceSessionActive,
  voiceSessionStatus,
  voiceCaptureState,
  onStartVoiceSession,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onEndSession,
}: ControlDockProps): JSX.Element {
  const isPanelOpen = useUiStore((state) => state.isPanelOpen);
  const togglePanel = useUiStore((state) => state.togglePanel);
  const closePanel = useUiStore((state) => state.closePanel);
  const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);

  const [isHovered, setIsHovered] = useState(false);
  const [isWindowFocused, setIsWindowFocused] = useState(() => document.hasFocus());

  const shouldDimDock = !isPanelOpen && !isWindowFocused && !isHovered;
  const isVoiceCaptureBusy =
    voiceCaptureState === 'requestingPermission' || voiceCaptureState === 'stopping';
  const isVoiceCapturing = voiceCaptureState === 'capturing';
  const isVoiceSessionBusy =
    voiceSessionStatus === 'connecting' || voiceSessionStatus === 'stopping';
  const isMicrophoneAvailable =
    voiceSessionStatus === 'ready' ||
    voiceSessionStatus === 'interrupted' ||
    voiceSessionStatus === 'recovering' ||
    voiceSessionStatus === 'capturing' ||
    voiceSessionStatus === 'streaming' ||
    voiceSessionStatus === 'stopping';
  const micButtonClassName = [
    isVoiceCapturing ? 'control-dock__btn--active' : '',
    isVoiceCaptureBusy ? 'control-dock__btn--pending' : '',
  ].filter(Boolean).join(' ') || undefined;
  const microphoneLabel = !isMicrophoneAvailable
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
  const voiceSessionLabel = isTextSessionActive
    ? 'Voice session unavailable in text mode'
    : isVoiceSessionBusy
      ? voiceSessionStatus === 'connecting'
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
        label="Camera unavailable in text mode"
        disabled
      >
        <MonitorOff size={18} />
      </IconButton>

      <IconButton
        label={voiceSessionLabel}
        className={isVoiceSessionActive ? 'control-dock__btn--danger' : 'control-dock__btn--start'}
        disabled={isTextSessionActive || isVoiceSessionBusy}
        onClick={() => {
          if (isTextSessionActive || isVoiceSessionBusy) {
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
