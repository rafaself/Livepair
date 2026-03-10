import { useEffect, useState } from 'react';
import { Ban, ChevronLeft, Mic, MicOff, MonitorOff, PhoneOff } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import { useUiStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { VoiceCaptureState } from '../../runtime/types';
import './ControlDock.css';

export type ControlDockProps = {
  isSessionActive: boolean;
  voiceCaptureState: VoiceCaptureState;
  onStartVoiceCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onStartSession: () => Promise<void>;
  onEndSession: () => Promise<void>;
};

export function ControlDock({
  isSessionActive,
  voiceCaptureState,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onStartSession: _onStartSession,
  onEndSession: _onEndSession,
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
  const micButtonClassName = [
    isVoiceCapturing ? 'control-dock__btn--active' : '',
    isVoiceCaptureBusy ? 'control-dock__btn--pending' : '',
  ].filter(Boolean).join(' ') || undefined;
  const microphoneLabel = isVoiceCapturing
    ? 'Stop microphone capture'
    : voiceCaptureState === 'requestingPermission'
      ? 'Requesting microphone permission'
      : voiceCaptureState === 'stopping'
        ? 'Stopping microphone capture'
        : voiceCaptureState === 'error'
          ? 'Retry microphone capture'
          : 'Start microphone capture';

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
        aria-disabled={isVoiceCaptureBusy}
        onClick={() => {
          if (isVoiceCaptureBusy) {
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
        label={
          isSessionActive
            ? 'Voice session unavailable in text mode'
            : 'Voice mode unavailable in text mode'
        }
        className={isSessionActive ? 'control-dock__btn--danger' : 'control-dock__btn--start'}
        disabled
      >
        {isSessionActive ? <PhoneOff size={18} /> : <Ban size={18} />}
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
