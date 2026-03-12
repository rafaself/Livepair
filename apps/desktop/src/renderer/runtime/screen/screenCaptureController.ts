import { logRuntimeDiagnostic, logRuntimeError } from '../core/logger';
import { asErrorDetail } from '../core/runtimeUtils';
import type { DesktopSession } from '../transport/transport.types';
import type { VoiceSessionStatus } from '../voice/voice.types';
import type {
  LocalScreenFrame,
  ScreenCaptureDiagnostics,
  ScreenCaptureState,
} from './screen.types';
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
  }) => Promise<void>;
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
  let screenCaptureGeneration = 0;
  let screenSendChain = Promise.resolve();
  let stopInFlight: Promise<void> | null = null;

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

  const isCurrentCapture = (
    capture: LocalScreenCapture,
    generation: number,
  ): boolean => {
    return screenCapture === capture && screenCaptureGeneration === generation;
  };

  const releaseCurrentCapture = (
    capture: LocalScreenCapture,
    generation: number,
  ): void => {
    if (!isCurrentCapture(capture, generation)) {
      return;
    }

    screenCapture = null;
    screenCaptureGeneration += 1;
  };

  const stopCapture = (
    options: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
      propagateStopError?: boolean;
    } = {},
  ): Promise<void> => {
    const {
      nextState = 'disabled',
      detail = null,
      preserveDiagnostics = false,
      uploadStatus = 'idle',
      propagateStopError = false,
    } = options;

    if (!screenCapture && stopInFlight) {
      return stopInFlight;
    }

    const capture = screenCapture;

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
      return Promise.resolve();
    }

    screenCapture = null;
    screenCaptureGeneration += 1;
    screenSendChain = Promise.resolve();
    store.getState().setScreenCaptureState('stopping');

    const finalizeStop = async (): Promise<void> => {
      let stopError: unknown;

      try {
        await capture.stop();
      } catch (error) {
        stopError = error;
        logRuntimeError('screen-capture', 'capture stop failed', {
          detail: asErrorDetail(error, 'Failed to stop screen capture'),
        });
      } finally {
        store.getState().setScreenCaptureState(nextState);
        if (preserveDiagnostics) {
          store.getState().setScreenCaptureDiagnostics({
            lastUploadStatus: uploadStatus,
            lastError: detail,
          });
        } else {
          resetDiagnostics();
        }
        if (stopInFlight === stopPromise) {
          stopInFlight = null;
        }
      }

      if (stopError && propagateStopError) {
        throw stopError;
      }
    };

    const stopPromise = finalizeStop();
    stopInFlight = stopPromise;
    return stopPromise;
  };

  const stopInternal = (
    options: {
      nextState?: 'disabled' | 'error';
      detail?: string | null;
      preserveDiagnostics?: boolean;
      uploadStatus?: 'idle' | 'error';
    } = {},
  ): Promise<void> => {
    return stopCapture(options);
  };

  const enqueueFrameSend = (frame: LocalScreenFrame): Promise<void> => {
    const transport = getTransport();
    const capture = screenCapture;
    const captureGeneration = screenCaptureGeneration;

    // Resume swaps transports without replaying captured frames into the next session.
    // Frames produced while no active transport is attached are intentionally dropped.
    if (!transport || !capture) {
      return Promise.resolve();
    }

    store.getState().setScreenCaptureDiagnostics({
      lastUploadStatus: 'sending',
      lastError: null,
    });

    screenSendChain = screenSendChain
      .then(async () => {
        if (getTransport() !== transport || !isCurrentCapture(capture, captureGeneration)) {
          return;
        }

        await transport.sendVideoFrame(frame.data, frame.mimeType);

        if (!isCurrentCapture(capture, captureGeneration) || getTransport() !== transport) {
          return;
        }

        logRuntimeDiagnostic('screen-capture', 'video frame sent', {
          sequence: frame.sequence,
          mimeType: frame.mimeType,
          byteLength: frame.data.byteLength,
          widthPx: frame.widthPx,
          heightPx: frame.heightPx,
        });
        store.getState().setScreenCaptureState('streaming');
        store.getState().setScreenCaptureDiagnostics({
          lastUploadStatus: 'sent',
          lastError: null,
        });
      })
      .catch((error) => {
        if (!isCurrentCapture(capture, captureGeneration) || getTransport() !== transport) {
          return;
        }

        const detail = asErrorDetail(error, 'Failed to send screen frame');
        logRuntimeError('screen-capture', 'video frame send failed', {
          detail,
          sequence: frame.sequence,
          mimeType: frame.mimeType,
          byteLength: frame.data.byteLength,
          widthPx: frame.widthPx,
          heightPx: frame.heightPx,
        });
        store.getState().setLastRuntimeError(detail);
        void stopInternal({
          nextState: 'error',
          detail,
          preserveDiagnostics: true,
          uploadStatus: 'error',
        });
      });

    return screenSendChain;
  };

  const start = async (): Promise<void> => {
    if (stopInFlight) {
      await stopInFlight;
    }

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
      state.screenCaptureState === 'requestingPermission' ||
      state.screenCaptureState === 'stopping'
    ) {
      return;
    }

    state.setScreenCaptureState('requestingPermission');
    resetDiagnostics();

    const captureGeneration = screenCaptureGeneration + 1;
    const capture = createCapture({
      onFrame: (frame: LocalScreenFrame) => {
        if (!isCurrentCapture(capture, captureGeneration) || !getTransport()) {
          return;
        }

        void enqueueFrameSend(frame);
      },
      onDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => {
        if (!isCurrentCapture(capture, captureGeneration)) {
          return;
        }

        store.getState().setScreenCaptureDiagnostics(patch);
      },
      onError: (detail: string) => {
        if (!isCurrentCapture(capture, captureGeneration)) {
          return;
        }

        logRuntimeError('screen-capture', 'capture error', { detail });
        store.getState().setLastRuntimeError(detail);
        void stopInternal({
          nextState: 'error',
          detail,
          preserveDiagnostics: true,
          uploadStatus: 'error',
        });
      },
    });
    screenCapture = capture;
    screenCaptureGeneration = captureGeneration;

    try {
      await capture.start({});

      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      store.getState().setScreenCaptureState('ready');
      store.getState().setScreenCaptureState('capturing');
    } catch (error) {
      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      const detail = asErrorDetail(error, 'Screen capture failed to start');
      releaseCurrentCapture(capture, captureGeneration);
      store.getState().setScreenCaptureState('error');
      store.getState().setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      store.getState().setLastRuntimeError(detail);
    }
  };

  const stop = async (): Promise<void> => {
    const state = store.getState();

    if (
      state.screenCaptureState === 'disabled' ||
      state.screenCaptureState === 'stopping'
    ) {
      await stopInFlight;
      return;
    }

    await stopCapture({
      nextState: 'disabled',
      propagateStopError: true,
    });
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
