import { Mic, MicOff, Monitor, MonitorOff, Square, ScanEye } from 'lucide-react';
import { Divider, IconButton } from '../primitives';
import type { ControlDockUiState } from './controlDockUiState';

export type ControlDockSpeechControlsProps = {
  onEndSession: () => Promise<void>;
  onStartScreenCapture: () => Promise<void>;
  onStartVoiceCapture: () => Promise<void>;
  onStopScreenCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onAnalyzeScreenNow: () => void;
  uiState: ControlDockUiState;
};

export function ControlDockSpeechControls({
  onEndSession,
  onStartScreenCapture,
  onStartVoiceCapture,
  onStopScreenCapture,
  onStopVoiceCapture,
  onAnalyzeScreenNow,
  uiState,
}: ControlDockSpeechControlsProps): JSX.Element | null {
  if (!uiState.showSpeechControls) {
    return null;
  }

  return (
    <>
      <IconButton
        label={uiState.microphoneLabel}
        className={uiState.micButtonClassName}
        disabled={!uiState.isMicrophoneAvailable || uiState.isVoiceCaptureBusy}
        onClick={() => {
          if (!uiState.isMicrophoneAvailable || uiState.isVoiceCaptureBusy) {
            return;
          }

          if (uiState.isVoiceCapturing) {
            void onStopVoiceCapture();
            return;
          }

          void onStartVoiceCapture();
        }}
      >
        {uiState.isVoiceCapturing ? <Mic size={18} /> : <MicOff size={18} />}
      </IconButton>

      <IconButton
        label={uiState.screenContextLabel}
        className={uiState.screenButtonClassName}
        disabled={!uiState.isScreenContextAvailable || uiState.isScreenContextBusy}
        onClick={() => {
          if (!uiState.isScreenContextAvailable || uiState.isScreenContextBusy) {
            return;
          }

          if (uiState.isScreenContextActive) {
            void onStopScreenCapture();
            return;
          }

          void onStartScreenCapture();
        }}
      >
        {uiState.isScreenContextActive ? <Monitor size={18} /> : <MonitorOff size={18} />}
      </IconButton>

      {uiState.canAnalyzeScreen ? (
        <IconButton
          label="Analyze screen now"
          onClick={onAnalyzeScreenNow}
        >
          <ScanEye size={18} />
        </IconButton>
      ) : null}

      {uiState.showEndSpeechModeControl ? (
        <IconButton
          label={uiState.endSpeechModeLabel}
          className="control-dock__btn--danger"
          disabled={!uiState.canUseEndSpeechMode}
          onClick={() => {
            if (!uiState.canUseEndSpeechMode) {
              return;
            }

            void onEndSession();
          }}
        >
          <Square size={18} fill="currentColor" />
        </IconButton>
      ) : null}

      <Divider orientation="horizontal" />
    </>
  );
}
