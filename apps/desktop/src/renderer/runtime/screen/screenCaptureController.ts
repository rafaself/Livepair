import { logRuntimeError } from '../core/logger';
import { asErrorDetail } from '../core/runtimeUtils';
import type { VoiceSessionStatus } from '../voice/voice.types';
import type {
  LocalScreenFrame,
  ScreenCaptureDiagnostics,
} from './screen.types';
import type {
  LocalScreenCapture,
  LocalScreenCaptureObserver,
} from './localScreenCapture';
import { SCREEN_CAPTURE_START_POLICY } from './screenCapturePolicy';
import { createVisualSendPolicy } from './visualSendPolicy';
import {
  createScreenFrameDumpCoordinator,
} from './controller/screenFrameDumpCoordinator';
import {
  createScreenFrameSendCoordinator,
} from './controller/screenFrameSendCoordinator';
import type {
  CreateScreenCapture,
  GetRealtimeOutboundGateway,
  GetTransport,
  ScreenCaptureController,
  ScreenCaptureStoreApi,
  ScreenFrameDumpControls,
  StopScreenCaptureOptions,
} from './controller/screenCaptureControllerTypes';

export type { ScreenCaptureController } from './controller/screenCaptureControllerTypes';

type StopCaptureOptions = StopScreenCaptureOptions & {
  propagateStopError?: boolean;
};

function isActiveVoiceSessionStatus(status: VoiceSessionStatus): boolean {
  return (
    status === 'ready'
    || status === 'capturing'
    || status === 'streaming'
    || status === 'interrupted'
  );
}

export function createScreenCaptureController(
  store: ScreenCaptureStoreApi,
  createCapture: CreateScreenCapture,
  getTransport: GetTransport,
  getRealtimeOutboundGateway: GetRealtimeOutboundGateway,
  screenFrameDumpControls?: ScreenFrameDumpControls,
  visualSendPolicyOptions?: VisualSendPolicyOptions,
): ScreenCaptureController {
  const visualPolicy = createVisualSendPolicy(visualSendPolicyOptions);

  const flushVisualDiagnostics = (): void => {
    store.getState().setVisualSendDiagnostics(visualPolicy.getDiagnostics());
  };

  let screenCapture: LocalScreenCapture | null = null;
  let screenCaptureGeneration = 0;
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

  const getActiveCapture = (): {
    capture: LocalScreenCapture;
    generation: number;
  } | null => {
    if (!screenCapture) {
      return null;
    }

    return {
      capture: screenCapture,
      generation: screenCaptureGeneration,
    };
  };

  const isCurrentCapture = (
    capture: LocalScreenCapture,
    generation: number,
  ): boolean => {
    return screenCapture === capture && screenCaptureGeneration === generation;
  };

  let stopInternal: (options?: StopScreenCaptureOptions) => Promise<void> = async () => {
    throw new Error('stopInternal called before initialization');
  };

  const frameDumpCoordinator = createScreenFrameDumpCoordinator({
    screenFrameDumpControls,
    isCurrentCapture,
    onError: (detail) => {
      store.getState().setLastRuntimeError(detail);
    },
  });

  const frameSendCoordinator = createScreenFrameSendCoordinator({
    getActiveCapture,
    isCurrentCapture,
    getTransport,
    getRealtimeOutboundGateway,
    allowSend: () => visualPolicy.allowSend(),
    flushVisualDiagnostics,
    onSendStarted: () => {
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sending',
        lastError: null,
      });
    },
    onSendSucceeded: () => {
      store.getState().setScreenCaptureState('streaming');
      store.getState().setScreenCaptureDiagnostics({
        lastUploadStatus: 'sent',
        lastError: null,
      });
    },
    onSendFailed: (detail) => {
      store.getState().setLastRuntimeError(detail);
      void stopInternal({
        nextState: 'error',
        detail,
        preserveDiagnostics: true,
        uploadStatus: 'error',
      });
    },
  });

  const releaseCurrentCapture = (
    capture: LocalScreenCapture,
    generation: number,
  ): void => {
    if (!isCurrentCapture(capture, generation)) {
      return;
    }

    screenCapture = null;
    screenCaptureGeneration += 1;
    frameDumpCoordinator.reset();
    frameSendCoordinator.reset();
  };

  const stopCapture = (
    options: StopCaptureOptions = {},
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
      visualPolicy.onScreenShareStopped();
      flushVisualDiagnostics();
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
    frameDumpCoordinator.reset();
    frameSendCoordinator.reset();
    visualPolicy.onScreenShareStopped();
    flushVisualDiagnostics();
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

  stopInternal = (options = {}) => {
    return stopCapture(options);
  };

  const start = async (): Promise<void> => {
    if (stopInFlight) {
      await stopInFlight;
    }

    const state = store.getState();
    const voiceStatus = state.voiceSessionStatus;
    const transport = getTransport();

    if (transport === null || !isActiveVoiceSessionStatus(voiceStatus)) {
      const detail = 'Screen context requires an active Live session';
      state.setScreenCaptureState('error');
      state.setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      state.setLastRuntimeError(detail);
      return;
    }

    if (
      state.screenCaptureState === 'ready'
      || state.screenCaptureState === 'capturing'
      || state.screenCaptureState === 'streaming'
      || state.screenCaptureState === 'requestingPermission'
      || state.screenCaptureState === 'stopping'
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

        frameDumpCoordinator.persistFrame(capture, captureGeneration, frame);
        void frameSendCoordinator.enqueueFrameSend(frame);
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
    } satisfies LocalScreenCaptureObserver);
    screenCapture = capture;
    screenCaptureGeneration = captureGeneration;

    try {
      await capture.start(SCREEN_CAPTURE_START_POLICY);

      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      await frameDumpCoordinator.startSession(capture, captureGeneration);

      if (!isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      store.getState().setScreenCaptureState('ready');
      store.getState().setScreenCaptureState('capturing');
      visualPolicy.onScreenShareStarted();
      flushVisualDiagnostics();
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
      state.screenCaptureState === 'disabled'
      || state.screenCaptureState === 'stopping'
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
    enqueueFrameSend: frameSendCoordinator.enqueueFrameSend,
    isActive: () => screenCapture !== null,
    resetSendChain: frameSendCoordinator.reset,
    getVisualSendState: () => visualPolicy.getState(),
    analyzeScreenNow: () => {
      visualPolicy.analyzeScreenNow();
      flushVisualDiagnostics();
    },
    enableStreaming: () => {
      visualPolicy.enableStreaming();
      flushVisualDiagnostics();
    },
    stopStreaming: () => {
      visualPolicy.stopStreaming();
      flushVisualDiagnostics();
    },
  };
}
