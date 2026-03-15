import { LIVE_ADAPTER_KEY } from './transport/liveConfig';
import { isSpeechLifecycleActive } from './speech/speechSessionLifecycle';
import { isTextTurnInFlight } from './text/textSessionLifecycle';
import type { ProductMode } from './core/session.types';
import type { ScreenCaptureState } from './screen/screen.types';
import type { SpeechLifecycleStatus } from './speech/speech.types';
import type { TextSessionStatus } from './text/text.types';
import type {
  VoiceCaptureState,
  VoiceSessionStatus,
} from './voice/voice.types';
import type { TransportKind } from './transport/transport.types';

export type ControlGatingSnapshot = {
  currentMode: ProductMode;
  speechLifecycleStatus: SpeechLifecycleStatus;
  textSessionStatus: TextSessionStatus;
  activeTransport: TransportKind | null;
  voiceSessionStatus: VoiceSessionStatus;
  voiceCaptureState: VoiceCaptureState;
  screenCaptureState: ScreenCaptureState;
};

const MICROPHONE_STARTABLE_VOICE_STATUSES: VoiceSessionStatus[] = [
  'ready',
  'interrupted',
  'recovering',
];

const SCREEN_STARTABLE_VOICE_STATUSES: VoiceSessionStatus[] = [
  'ready',
  'capturing',
  'streaming',
  'interrupted',
  'recovering',
];

const ACTIVE_SCREEN_CAPTURE_STATES: ScreenCaptureState[] = [
  'ready',
  'capturing',
  'streaming',
];

function isSpeechLifecycleTransitioning(status: SpeechLifecycleStatus): boolean {
  return status === 'starting' || status === 'ending';
}

function hasLiveTransportCapability(snapshot: ControlGatingSnapshot): boolean {
  return (
    snapshot.activeTransport === LIVE_ADAPTER_KEY &&
    SCREEN_STARTABLE_VOICE_STATUSES.includes(snapshot.voiceSessionStatus)
  );
}

export function createControlGatingSnapshot(
  overrides: Partial<ControlGatingSnapshot> = {},
): ControlGatingSnapshot {
  return {
    currentMode: 'inactive',
    speechLifecycleStatus: 'off',
    textSessionStatus: 'idle',
    activeTransport: null,
    voiceSessionStatus: 'disconnected',
    voiceCaptureState: 'idle',
    screenCaptureState: 'disabled',
    ...overrides,
  };
}

export function shouldShowSpeechControls(snapshot: ControlGatingSnapshot): boolean {
  if (snapshot.speechLifecycleStatus === 'starting') {
    return false;
  }
  return snapshot.currentMode === 'speech' || isSpeechLifecycleActive(snapshot.speechLifecycleStatus);
}

export function getComposerSpeechActionKind(
  snapshot: ControlGatingSnapshot,
): 'start' | 'end' {
  // Intentionally does not use shouldShowSpeechControls — must return 'end' during
  // 'starting' so the composer can display a loading state while the session connects.
  return snapshot.currentMode === 'speech' || isSpeechLifecycleActive(snapshot.speechLifecycleStatus)
    ? 'end' : 'start';
}

export function canEndSpeechMode(snapshot: ControlGatingSnapshot): boolean {
  return shouldShowSpeechControls(snapshot) &&
    !isSpeechLifecycleTransitioning(snapshot.speechLifecycleStatus);
}

export function shouldShowDockEndControl(
  snapshot: ControlGatingSnapshot,
  isPanelOpen: boolean,
): boolean {
  return !isPanelOpen && shouldShowSpeechControls(snapshot);
}

export function canSubmitComposerText(snapshot: ControlGatingSnapshot): boolean {
  if (isTextTurnInFlight(snapshot.textSessionStatus)) {
    return false;
  }

  if (snapshot.currentMode !== 'speech') {
    return false;
  }

  if (isSpeechLifecycleTransitioning(snapshot.speechLifecycleStatus)) {
    return false;
  }

  return hasLiveTransportCapability(snapshot);
}

export function canToggleMicrophone(snapshot: ControlGatingSnapshot): boolean {
  if (snapshot.currentMode !== 'speech') {
    return false;
  }

  if (
    snapshot.voiceCaptureState === 'requestingPermission' ||
    snapshot.voiceCaptureState === 'stopping'
  ) {
    return false;
  }

  if (snapshot.voiceCaptureState === 'capturing') {
    return true;
  }

  return (
    !isSpeechLifecycleTransitioning(snapshot.speechLifecycleStatus) &&
    MICROPHONE_STARTABLE_VOICE_STATUSES.includes(snapshot.voiceSessionStatus)
  );
}

export function canToggleScreenContext(snapshot: ControlGatingSnapshot): boolean {
  if (snapshot.currentMode !== 'speech') {
    return false;
  }

  if (
    snapshot.screenCaptureState === 'requestingPermission' ||
    snapshot.screenCaptureState === 'stopping'
  ) {
    return false;
  }

  if (ACTIVE_SCREEN_CAPTURE_STATES.includes(snapshot.screenCaptureState)) {
    return true;
  }

  return (
    !isSpeechLifecycleTransitioning(snapshot.speechLifecycleStatus) &&
    hasLiveTransportCapability(snapshot)
  );
}
