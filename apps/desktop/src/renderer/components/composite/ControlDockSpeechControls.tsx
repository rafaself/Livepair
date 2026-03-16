import { Mic, MicOff, Monitor, MonitorOff, ScanEye } from 'lucide-react';
import { Divider, IconButton, StopIcon } from '../primitives';
import type { ControlDockUiState } from './controlDockUiState';

export type ControlDockSpeechControlsProps = {
  onEndSession: () => Promise<void>;
  onStartScreenCapture: () => Promise<void>;
  onStartVoiceCapture: () => Promise<void>;
  onStopScreenCapture: () => Promise<void>;
  onStopVoiceCapture: () => Promise<void>;
  onSendScreenNow: () => void;
  uiState: ControlDockUiState;
};

export function ControlDockSpeechControls({
  onEndSession,
  onStartScreenCapture,
  onStartVoiceCapture,
  onStopScreenCapture,
  onStopVoiceCapture,
  onSendScreenNow,
  uiState,
}: ControlDockSpeechControlsProps): JSX.Element {
  return (
    <>
      <div
        className={`control-dock__item-wrapper ${uiState.showSpeechControls ? 'control-dock__item-wrapper--visible' : ''}`}
        aria-hidden={!uiState.showSpeechControls}
      >
        <div className="control-dock__item-content">
          <IconButton
            label={uiState.microphoneLabel}
            className={uiState.micButtonClassName}
            disabled={!uiState.isMicrophoneAvailable || uiState.isVoiceCaptureBusy}
            tabIndex={uiState.showSpeechControls ? 0 : -1}
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
        </div>
      </div>

      <div
        className={`control-dock__item-wrapper ${uiState.showSpeechControls ? 'control-dock__item-wrapper--visible' : ''}`}
        aria-hidden={!uiState.showSpeechControls}
      >
        <div className="control-dock__item-content">
          <IconButton
            label={uiState.screenContextLabel}
            className={uiState.screenButtonClassName}
            disabled={!uiState.isScreenContextAvailable || uiState.isScreenContextBusy}
            tabIndex={uiState.showSpeechControls ? 0 : -1}
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
        </div>
      </div>

      <div
        className={`control-dock__item-wrapper ${uiState.showManualSendControl ? 'control-dock__item-wrapper--visible' : ''}`}
        aria-hidden={!uiState.showManualSendControl}
      >
        <div className="control-dock__item-content">
          <IconButton
            label="Send screen now"
            onClick={onSendScreenNow}
            tabIndex={uiState.showManualSendControl ? 0 : -1}
          >
            <ScanEye size={18} />
          </IconButton>
        </div>
      </div>

      <div
        className={`control-dock__item-wrapper ${uiState.showEndSpeechModeControl ? 'control-dock__item-wrapper--visible' : ''}`}
        aria-hidden={!uiState.showEndSpeechModeControl}
      >
        <div className="control-dock__item-content">
          <IconButton
            label={uiState.endSpeechModeLabel}
            className="control-dock__btn--danger"
            disabled={!uiState.canUseEndSpeechMode}
            tabIndex={uiState.showEndSpeechModeControl ? 0 : -1}
            onClick={() => {
              if (!uiState.canUseEndSpeechMode) {
                return;
              }

              void onEndSession();
            }}
          >
            <StopIcon size={18} />
          </IconButton>
        </div>
      </div>

      <div
        className={`control-dock__item-wrapper control-dock__item-wrapper--divider ${uiState.showSpeechControls ? 'control-dock__item-wrapper--visible' : ''}`}
        aria-hidden={!uiState.showSpeechControls}
      >
        <div className="control-dock__item-content">
          <Divider orientation="horizontal" />
        </div>
      </div>
    </>
  );
}
