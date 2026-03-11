import { logRuntimeError } from '../core/logger';
import { asErrorDetail } from '../core/runtimeUtils';
import type {
  DesktopSession,
  LocalScreenFrame,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
  VoiceSessionStatus,
} from '../core/types';
import type {
  LocalScreenCapture,
  LocalScreenCaptureObserver,
} from './localScreenCapture';

type ScreenCaptureStoreApi = {
  getState: () => {
    voiceSessionStatus: VoiceSessionStatus;
    screenCaptureState: ScreenCaptureState;
    setScreenCaptureState: (state: ScreenCaptureState) => void;
    setScreenCaptureDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => void;
    setLastRuntimeError: (error: string | null) => void;
  };
};

export type ScreenCaptureController = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  stopInternal: (options?: {
    nextState?: 'disabled' | 'error';
    detail?: string | null;
    preserveDiagnostics?: boolean;
    uploadStatus?: 'idle' | 'error';
  }) => void;
  resetDiagnostics: () => void;
  enqueueFrameSend: (frame: LocalScreenFrame) => Promise<void>;
  isActive: () => boolean;
  resetSendChain: () => void;
};

export function createScreenCaptureController(
  store: ScreenCaptureStoreApi,
  createCapture: (observer: LocalScreenCaptureObserver) => LocalScreenCapture,
  getTransport: () => DesktopSession | null,
): ScreenCaptureController {
  let screenCapture: LocalScreenCapture | null = null;
  let screenSendChain = Promise.resolve();

  const resetDiagnostics = (): void => {
    store.getState().setScreenCaptureDiagnostics({
      captureSource: null,
      frameCount: 0,
      frameRateHz: null,
      widthPx: null,
      heightPx: null,
      lastFrameAt: null,
      lastUploadStatus: 'idle',
      lastError: null,
    });
  };

  const stopInternal = (
    options: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
    } = {},
  ): void => {
    const {
      nextState = 'disabled',
      detail = null,
      preserveDiagnostics = false,
      uploadStatus = 'idle',
    } = options;
    const capture = screenCapture;
    screenCapture = null;

    if (!capture) {
      store.getState().setScreenCaptureState(nextState);
      if (preserveDiagnostics) {
        store.getState().setScreenCaptureDiagnostics({
          lastUploadStatus: uploadStatus,
          lastError: detail,
        });
      } else {
        resetDiagnostics();
      }
      return;
    }

    store.getState().setScreenCaptureState('stopping');
    void capture
      .stop()
      .catch(() => undefined)
      .finally(() => {
        store.getState().setScreenCaptureState(nextState);
        if (preserveDiagnostics) {
          store.getState().setScreenCaptureDiagnostics({
            lastUploadStatus: uploadStatus,
            lastError: detail,
          });
        } else {
          resetDiagnostics();
        }
      });
  };

  const enqueueFrameSend = (frame: LocalScreenFrame): Promise<void> => {
    const transport = getTransport();

    if (!transport || !screenCapture) {
      return Promise.resolve();
    }

    store.getState().setScreenCaptureDiagnostics({
      lastUploadStatus: 'sending',
      lastError: null,
    });

    screenSendChain = screenSendChain
      .then(async () => {
        await getTransport()?.sendVideoFrame(frame.data, frame.mimeType);

        if (!screenCapture) {
          return;
        }

        store.getState().setScreenCaptureState('streaming');
        store.getState().setScreenCaptureDiagnostics({
          lastUploadStatus: 'sent',
          lastError: null,
        });
      })
      .catch((error) => {
        const detail = asErrorDetail(error, 'Failed to send screen frame');
        logRuntimeError('screen-capture', 'video frame send failed', { detail });
        store.getState().setLastRuntimeError(detail);
        stopInternal({
          nextState: 'error',
          detail,
          preserveDiagnostics: true,
          uploadStatus: 'error',
        });
      });

    return screenSendChain;
  };

  const start = async (): Promise<void> => {
    const state = store.getState();
    const voiceStatus = state.voiceSessionStatus;

    if (
      voiceStatus !== 'ready' &&
      voiceStatus !== 'capturing' &&
      voiceStatus !== 'streaming' &&
      voiceStatus !== 'recovering' &&
      voiceStatus !== 'interrupted'
    ) {
      const detail = 'Screen context requires an active voice session';
      state.setScreenCaptureState('error');
      state.setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      state.setLastRuntimeError(detail);
      return;
    }

    if (
      state.screenCaptureState === 'ready' ||
      state.screenCaptureState === 'capturing' ||
      state.screenCaptureState === 'streaming' ||
      state.screenCaptureState === 'requestingPermission'
    ) {
      return;
    }

    state.setScreenCaptureState('requestingPermission');
    resetDiagnostics();

    screenCapture = createCapture({
      onFrame: (frame: LocalScreenFrame) => {
        if (!getTransport() || !screenCapture) {
          return;
        }

        void enqueueFrameSend(frame);
      },
      onDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => {
        store.getState().setScreenCaptureDiagnostics(patch);
      },
      onError: (detail: string) => {
        logRuntimeError('screen-capture', 'capture error', { detail });
        store.getState().setLastRuntimeError(detail);
        stopInternal({
          nextState: 'error',
          detail,
          preserveDiagnostics: true,
          uploadStatus: 'error',
        });
      },
    });

    try {
      await screenCapture.start({});
      store.getState().setScreenCaptureState('ready');
      store.getState().setScreenCaptureState('capturing');
    } catch (error) {
      const detail = asErrorDetail(error, 'Screen capture failed to start');
      store.getState().setScreenCaptureState('error');
      store.getState().setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      store.getState().setLastRuntimeError(detail);
      screenCapture = null;
    }
  };

  const stop = async (): Promise<void> => {
    const state = store.getState();

    if (
      state.screenCaptureState === 'disabled' ||
      state.screenCaptureState === 'stopping'
    ) {
      return;
    }

    const capture = screenCapture;
    screenCapture = null;

    if (!capture) {
      state.setScreenCaptureState('disabled');
      resetDiagnostics();
      return;
    }

    state.setScreenCaptureState('stopping');

    try {
      await capture.stop();
    } finally {
      store.getState().setScreenCaptureState('disabled');
      resetDiagnostics();
    }
  };

  return {
    start,
    stop,
    stopInternal,
    resetDiagnostics,
    enqueueFrameSend,
    isActive: () => screenCapture !== null,
    resetSendChain: () => {
      screenSendChain = Promise.resolve();
    },
  };
}
