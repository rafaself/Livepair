import {
  canEndSpeechMode,
  canToggleMicrophone,
  canToggleScreenContext,
  createControlGatingSnapshot,
  shouldShowDockEndControl,
  shouldShowSpeechControls,
  type ProductMode,
  type ScreenCaptureState,
  type SpeechLifecycleStatus,
  type TransportKind,
  type VoiceCaptureState,
  type VoiceSessionStatus,
} from '../../runtime';
import type { ScreenContextMode } from '../../../shared';

type ControlDockUiStateInput = {
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  activeTransport?: TransportKind | null;
  voiceSessionStatus?: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
  screenContextMode: ScreenContextMode;
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
  showManualSendControl: boolean;
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
    return 'Screen sharing unavailable while Live session starts';
  }

  if (speechLifecycleStatus === 'ending') {
    return 'Screen sharing unavailable while Live session ends';
  }

  if (!showSpeechControls) {
    return 'Screen sharing unavailable outside a Live session';
  }

  if (!isScreenContextAvailable) {
    return 'Screen sharing unavailable while Live session starts';
  }

  if (isScreenContextActive) {
    return 'Stop sharing screen';
  }

  if (screenCaptureState === 'requestingPermission') {
    return 'Requesting screen permission';
  }

  if (screenCaptureState === 'stopping') {
    return 'Stopping screen share';
  }

  if (screenCaptureState === 'error') {
    return 'Retry screen share';
  }

  return 'Share screen';
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
  screenContextMode,
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
    screenCaptureState === 'capturing';
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
    showManualSendControl:
      screenContextMode === 'manual' && isScreenContextActive && !isScreenContextBusy,
  };
}
