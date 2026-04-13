import type { AssistantVoice } from '@livepair/shared-types';
import type { SessionStoreState } from '../../store/sessionStore';
import type { SettingsStoreState } from '../../store/settingsStore';
import type {
  checkBackendHealth,
  reportLiveTelemetry,
  requestSessionToken,
  searchProjectKnowledge,
} from '../../api/backend';
import type { LocalScreenCaptureObserver, LocalScreenCapture } from '../screen/localScreenCapture';
import type { LocalVoiceCapture } from '../audio/localVoiceCapture';
import type {
  AssistantAudioPlayback,
  AudioInputObserver,
  AudioOutputObserver,
} from '../audio/audio.types';
import type { LiveTransportAdapter } from '../transport/liveTransportAdapter';
import type {
  DesktopSession,
  TransportKind,
} from '../transport/transport.types';
import type { LocalVoiceChunk } from '../voice/voice.types';
import type { AssistantRuntimeState } from '../assistantRuntimeState';
import type {
  RuntimeLogger,
} from './session.types';
import type {
  SaveScreenFrameDumpFrameRequest,
  ScreenCaptureSourceSnapshot,
  ScreenFrameDumpSessionInfo,
} from '../../../shared';

export type SessionStoreApi = {
  getState: () => SessionStoreState;
};

export type SettingsStoreApi = {
  getState: () => Pick<SettingsStoreState, 'settings'>;
};

export type DebugAssistantState = AssistantRuntimeState;

export type ScreenSourceAdapter = {
  listScreenCaptureSources: () => Promise<ScreenCaptureSourceSnapshot>;
  selectScreenCaptureSource: (
    sourceId: string | null,
  ) => Promise<ScreenCaptureSourceSnapshot>;
};

export type ScreenFrameDumpAdapter = {
  shouldSaveFrames: () => boolean;
  startScreenFrameDumpSession: () => Promise<ScreenFrameDumpSessionInfo>;
  saveScreenFrameDumpFrame: (
    request: SaveScreenFrameDumpFrameRequest,
  ) => Promise<void>;
  setScreenFrameDumpDirectoryPath: (directoryPath: string | null) => void;
};

export type RuntimeEnvironmentAdapter = {
  environment: string;
  platform: string;
  appVersion: string;
};

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
  searchProjectKnowledge: typeof searchProjectKnowledge;
  screenSourceAdapter: ScreenSourceAdapter;
  screenFrameDumpAdapter: ScreenFrameDumpAdapter;
  runtimeEnvironment: RuntimeEnvironmentAdapter;
  transportAdapter: LiveTransportAdapter;
  createTransport?: (
    kind: TransportKind,
    options?: { voice?: AssistantVoice },
  ) => DesktopSession;
  createVoiceCapture: (
    observer: AudioInputObserver,
  ) => LocalVoiceCapture;
  createVoicePlayback: (
    observer: AudioOutputObserver,
    options: { selectedOutputDeviceId: string },
  ) => AssistantAudioPlayback;
  createScreenCapture: (observer: LocalScreenCaptureObserver) => LocalScreenCapture;
  store: SessionStoreApi;
  settingsStore: SettingsStoreApi;
};
