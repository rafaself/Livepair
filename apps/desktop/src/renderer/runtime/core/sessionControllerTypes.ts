import type { useSessionStore } from '../../store/sessionStore';
import type { useSettingsStore } from '../../store/settingsStore';
import type { AssistantVoice } from '@livepair/shared-types';
import type {
  checkBackendHealth,
  reportLiveTelemetry,
  requestSessionToken,
} from '../../api/backend';
import type { AssistantAudioPlaybackObserver } from '../audio/assistantAudioPlayback';
import type { LocalScreenCaptureObserver, LocalScreenCapture } from '../screen/localScreenCapture';
import type { LocalVoiceCapture } from '../audio/localVoiceCapture';
import type {
  AssistantAudioPlayback,
} from '../audio/audio.types';
import type {
  DesktopSession,
  TransportKind,
} from '../transport/transport.types';
import type {
  LocalVoiceChunk,
  VoiceCaptureDiagnostics,
} from '../voice/voice.types';
import type {
  RuntimeLogger,
} from './session.types';

export type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;
export type SettingsStoreApi = Pick<typeof useSettingsStore, 'getState'>;
export type DebugAssistantState = Parameters<
  ReturnType<SessionStoreApi['getState']>['setAssistantState']
>[0];

export type DesktopSessionController = {
  checkBackendHealth: () => Promise<void>;
  startSession: (options: { mode: 'speech' }) => Promise<void>;
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => Promise<void>;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => Promise<void>;
  /** Trigger a one-shot manual screen send when manual mode is active. */
  analyzeScreenNow: () => void;
  subscribeToVoiceChunks: (listener: (chunk: LocalVoiceChunk) => void) => () => void;
  submitTextTurn: (text: string) => Promise<boolean>;
  endSpeechMode: () => Promise<void>;
  endSession: () => Promise<void>;
  setAssistantState: (assistantState: DebugAssistantState) => void;
};

export type DesktopSessionControllerDependencies = {
  logger: RuntimeLogger;
  checkBackendHealth: typeof checkBackendHealth;
  requestSessionToken: typeof requestSessionToken;
  reportLiveTelemetry: typeof reportLiveTelemetry;
  createTransport: (
    kind: TransportKind,
    options?: { voice?: AssistantVoice },
  ) => DesktopSession;
  createVoiceCapture: (
    observer: {
      onChunk: (chunk: LocalVoiceChunk) => void;
      onDiagnostics: (diagnostics: Partial<VoiceCaptureDiagnostics>) => void;
      onError: (detail: string) => void;
    },
  ) => LocalVoiceCapture;
  createVoicePlayback: (
    observer: AssistantAudioPlaybackObserver,
    options: { selectedOutputDeviceId: string },
  ) => AssistantAudioPlayback;
  createScreenCapture: (observer: LocalScreenCaptureObserver) => LocalScreenCapture;
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
};
