import type { useSessionStore } from '../../store/sessionStore';
import type { useSettingsStore } from '../../store/settingsStore';
import type { checkBackendHealth, requestSessionToken, startTextChatStream } from '../../api/backend';
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
  SessionMode,
} from './session.types';

export type SessionStoreApi = Pick<typeof useSessionStore, 'getState'>;
export type SettingsStoreApi = Pick<typeof useSettingsStore, 'getState'>;
export type DebugAssistantState = Parameters<
  ReturnType<SessionStoreApi['getState']>['setAssistantState']
>[0];

export type DesktopSessionController = {
  checkBackendHealth: () => Promise<void>;
  startSession: (options: { mode: SessionMode }) => Promise<void>;
  startVoiceCapture: () => Promise<void>;
  stopVoiceCapture: () => Promise<void>;
  startScreenCapture: () => Promise<void>;
  stopScreenCapture: () => Promise<void>;
  subscribeToVoiceChunks: (listener: (chunk: LocalVoiceChunk) => void) => () => void;
  submitTextTurn: (text: string) => Promise<boolean>;
  endSpeechMode: () => Promise<void>;
  endSession: () => Promise<void>;
  setAssistantState: (assistantState: DebugAssistantState) => void;
};

export type DesktopSessionControllerDependencies = {
  logger: RuntimeLogger;
  checkBackendHealth: typeof checkBackendHealth;
  startTextChatStream: typeof startTextChatStream;
  requestSessionToken: typeof requestSessionToken;
  createTransport: (kind: TransportKind) => DesktopSession;
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
