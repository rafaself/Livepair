import {
  canEndSpeechMode,
  canToggleMicrophone,
  canToggleScreenContext,
  createControlGatingSnapshot,
  shouldShowDockEndControl,
  shouldShowSpeechControls,
} from '../../runtime/controlGating';
import type { ProductMode } from '../../runtime/core/session.types';
import type { SpeechLifecycleStatus } from '../../runtime/speech/speech.types';
import type { ScreenCaptureState } from '../../runtime/screen/screen.types';
import type { TransportKind } from '../../runtime/transport/transport.types';
import type { VoiceCaptureState, VoiceSessionStatus } from '../../runtime/voice/voice.types';

export type ControlDockUiStateInput = {
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  activeTransport?: TransportKind | null;
  voiceSessionStatus?: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  isPanelOpen: boolean;
};

export type ControlDockUiState = {
  canUseEndSpeechMode: boolean;
  endSpeechModeLabel: string;
  isMicrophoneAvailable: boolean;
  isScreenContextActive: boolean;
  isScreenContextAvailable: boolean;
  isScreenContextBusy: boolean;
  isVoiceCaptureBusy: boolean;
  isVoiceCapturing: boolean;
  micButtonClassName: string | undefined;
  microphoneLabel: string;
  screenButtonClassName: string | undefined;
  screenContextLabel: string;
  showEndSpeechModeControl: boolean;
  showSpeechControls: boolean;
};

function getMicrophoneLabel(
  speechLifecycleStatus: SpeechLifecycleStatus,
  showSpeechControls: boolean,
  isMicrophoneAvailable: boolean,
  isVoiceCapturing: boolean,
  voiceCaptureState: VoiceCaptureState,
): string {
  if (speechLifecycleStatus === 'starting') {
    return 'Live session is starting';
  }

  if (speechLifecycleStatus === 'ending') {
    return 'Live session is ending';
  }

  if (!showSpeechControls) {
    return 'Microphone unavailable outside a Live session';
  }

  if (!isMicrophoneAvailable) {
    return 'Microphone unavailable while Live session starts';
  }

  if (isVoiceCapturing) {
    return 'Stop microphone capture';
  }

  if (voiceCaptureState === 'requestingPermission') {
    return 'Requesting microphone permission';
  }

  if (voiceCaptureState === 'stopping') {
    return 'Stopping microphone capture';
  }

  if (voiceCaptureState === 'error') {
    return 'Retry microphone capture';
  }

  return 'Start microphone capture';
}

function getScreenContextLabel(
  speechLifecycleStatus: SpeechLifecycleStatus,
  showSpeechControls: boolean,
  isScreenContextAvailable: boolean,
  isScreenContextActive: boolean,
  screenCaptureState: ScreenCaptureState,
): string {
  if (speechLifecycleStatus === 'starting') {
    return 'Screen context unavailable while Live session starts';
  }

  if (speechLifecycleStatus === 'ending') {
    return 'Screen context unavailable while Live session ends';
  }

  if (!showSpeechControls) {
    return 'Screen context unavailable outside a Live session';
  }

  if (!isScreenContextAvailable) {
    return 'Screen context unavailable while Live session starts';
  }

  if (isScreenContextActive) {
    return 'Stop screen context';
  }

  if (screenCaptureState === 'requestingPermission') {
    return 'Requesting screen permission';
  }

  if (screenCaptureState === 'stopping') {
    return 'Stopping screen context';
  }

  if (screenCaptureState === 'error') {
    return 'Retry screen context';
  }

  return 'Start screen context';
}

function getEndSpeechModeLabel(speechLifecycleStatus: SpeechLifecycleStatus): string {
  if (speechLifecycleStatus === 'starting') {
    return 'Starting Live session';
  }

  if (speechLifecycleStatus === 'ending') {
    return 'Ending Live session';
  }

  return 'End Live session';
}

export function createControlDockUiState({
  currentMode,
  speechLifecycleStatus,
  activeTransport = null,
  voiceSessionStatus = 'disconnected',
  voiceCaptureState,
  screenCaptureState,
  isPanelOpen,
}: ControlDockUiStateInput): ControlDockUiState {
  const controlGatingSnapshot = createControlGatingSnapshot({
    currentMode,
    speechLifecycleStatus,
    activeTransport,
    voiceSessionStatus,
    voiceCaptureState,
    screenCaptureState,
  });
  const isVoiceCaptureBusy =
    voiceCaptureState === 'requestingPermission' || voiceCaptureState === 'stopping';
  const isVoiceCapturing = voiceCaptureState === 'capturing';
  const isMicrophoneAvailable = canToggleMicrophone(controlGatingSnapshot);
  const isScreenContextBusy =
    screenCaptureState === 'requestingPermission' || screenCaptureState === 'stopping';
  const isScreenContextActive =
    screenCaptureState === 'ready' ||
    screenCaptureState === 'capturing' ||
    screenCaptureState === 'streaming';
  const isScreenContextAvailable = canToggleScreenContext(controlGatingSnapshot);
  const showSpeechControls = shouldShowSpeechControls(controlGatingSnapshot);

  return {
    canUseEndSpeechMode: canEndSpeechMode(controlGatingSnapshot),
    endSpeechModeLabel: getEndSpeechModeLabel(speechLifecycleStatus),
    isMicrophoneAvailable,
    isScreenContextActive,
    isScreenContextAvailable,
    isScreenContextBusy,
    isVoiceCaptureBusy,
    isVoiceCapturing,
    micButtonClassName: [
      isVoiceCapturing ? 'control-dock__btn--active' : '',
      isVoiceCaptureBusy ? 'control-dock__btn--pending' : '',
    ].filter(Boolean).join(' ') || undefined,
    microphoneLabel: getMicrophoneLabel(
      speechLifecycleStatus,
      showSpeechControls,
      isMicrophoneAvailable,
      isVoiceCapturing,
      voiceCaptureState,
    ),
    screenButtonClassName: [
      isScreenContextActive ? 'control-dock__btn--active' : '',
      isScreenContextBusy ? 'control-dock__btn--pending' : '',
    ].filter(Boolean).join(' ') || undefined,
    screenContextLabel: getScreenContextLabel(
      speechLifecycleStatus,
      showSpeechControls,
      isScreenContextAvailable,
      isScreenContextActive,
      screenCaptureState,
    ),
    showEndSpeechModeControl: shouldShowDockEndControl(controlGatingSnapshot, isPanelOpen),
    showSpeechControls,
  };
}
