import type { RealtimeOutboundGateway } from '../../outbound/outbound.types';
import type { DesktopSession } from '../../transport/transport.types';
import type { VoiceSessionStatus } from '../../voice/voice.types';
import type {
  LocalScreenCapture,
  LocalScreenCaptureObserver,
} from '../localScreenCapture';
import type {
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
} from '../screen.types';
import type { VisualSendDiagnostics } from '../screenContextDiagnostics';
import type { ScreenFrameAvailableEvent, ScreenOutboundFrameRequest } from './screenFrameContracts';
import type {
  ScreenFrameDumpMode,
  ScreenFrameDumpQuality,
  ScreenFrameDumpReason,
  SaveScreenFrameDumpFrameRequest,
  ScreenFrameDumpSessionInfo,
} from '../../../../shared';

export type ScreenCaptureStoreApi = {
  getState: () => {
    voiceSessionStatus: VoiceSessionStatus;
    screenCaptureState: ScreenCaptureState;
    setScreenCaptureState: (state: ScreenCaptureState) => void;
    setScreenCaptureDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => void;
    setVisualSendDiagnostics: (diagnostics: VisualSendDiagnostics) => void;
    setLastRuntimeError: (error: string | null) => void;
  };
};

export type ScreenCaptureController = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  stopInternal: (options?: StopScreenCaptureOptions) => Promise<void>;
  resetDiagnostics: () => void;
  enqueueFrameSend: (request: ScreenOutboundFrameRequest) => Promise<void>;
  isActive: () => boolean;
  resetSendChain: () => void;
  analyzeScreenNow: () => void;
};

export type ScreenFrameDumpControls = {
  shouldSaveFrames: () => boolean;
  startScreenFrameDumpSession: () => Promise<ScreenFrameDumpSessionInfo>;
  saveScreenFrameDumpFrame: (request: SaveScreenFrameDumpFrameRequest) => Promise<void>;
  setScreenFrameDumpDirectoryPath: (directoryPath: string | null) => void;
};

export type ScreenFrameDumpMetadata = {
  savedAt: string;
  mode: ScreenFrameDumpMode;
  quality: ScreenFrameDumpQuality;
  reason: ScreenFrameDumpReason;
};

export type ActiveScreenCapture = {
  capture: LocalScreenCapture;
  generation: number;
};

export type GetActiveScreenCapture = () => ActiveScreenCapture | null;

export type IsCurrentCapture = (
  capture: LocalScreenCapture,
  generation: number,
) => boolean;

export type StopScreenCaptureOptions = {
  nextState?: 'disabled' | 'error';
  detail?: string | null;
  preserveDiagnostics?: boolean;
  uploadStatus?: 'idle' | 'error';
};

export type StopScreenCapture = (
  options?: StopScreenCaptureOptions,
) => Promise<void>;

export type CreateScreenCapture = (
  observer: LocalScreenCaptureObserver,
) => LocalScreenCapture;

export type GetTransport = () => DesktopSession | null;

export type GetRealtimeOutboundGateway = () => RealtimeOutboundGateway;

export type OnScreenFrameAvailable = (event: ScreenFrameAvailableEvent) => void;
