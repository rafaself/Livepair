import { logRuntimeError } from '../../core/logger';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { VoiceSessionStatus } from '../../voice/voice.types';
import type {
  LocalScreenFrame,
  ScreenCaptureDiagnostics,
} from '../screen.types';
import type { LocalScreenCaptureObserver } from '../localScreenCapture';
import { SCREEN_CAPTURE_START_POLICY } from '../screenCapturePolicy';
import type {
  CreateScreenCapture,
  GetTransport,
  ScreenCaptureController,
  ScreenCaptureStoreApi,
  StopScreenCaptureOptions,
} from './screenCaptureControllerTypes';
import type { ScreenCaptureControllerState } from './screenCaptureControllerState';
import type { ScreenFrameDumpCoordinator } from './screenFrameDumpCoordinator';
import type { ScreenFrameSendCoordinator } from './screenFrameSendCoordinator';

type StopCaptureOptions = StopScreenCaptureOptions & {
  propagateStopError?: boolean;
};

function isLiveSessionReadyForScreenCapture(status: VoiceSessionStatus): boolean {
  return (
    status === 'ready'
    || status === 'capturing'
    || status === 'streaming'
    || status === 'interrupted'
    || status === 'recovering'
  );
}

export function createScreenCaptureLifecycle({
  store,
  controllerState,
  createCapture,
  getTransport,
  resetDiagnostics,
  frameDumpCoordinator,
  frameSendCoordinator,
  onFrameCaptured,
  getCaptureStartParams,
  onScreenShareStarted,
  onScreenShareStopped,
}: {
  store: ScreenCaptureStoreApi;
  controllerState: ScreenCaptureControllerState;
  createCapture: CreateScreenCapture;
  getTransport: GetTransport;
  resetDiagnostics: () => void;
  frameDumpCoordinator: ScreenFrameDumpCoordinator;
  frameSendCoordinator: ScreenFrameSendCoordinator;
  onFrameCaptured?: (frame: LocalScreenFrame) => void;
  getCaptureStartParams?: () => { jpegQuality?: number; maxWidthPx?: number };
  onScreenShareStarted: () => void;
  onScreenShareStopped: () => void;
}): Pick<
  ScreenCaptureController,
  'start' | 'stop' | 'stopInternal' | 'isActive'
> {
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

    if (!controllerState.getCapture() && controllerState.getStopInFlight()) {
      return controllerState.getStopInFlight()!;
    }

    const capture = controllerState.getCapture();

    if (!capture) {
      onScreenShareStopped();
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

    controllerState.clearCapture();
    frameDumpCoordinator.reset();
    frameSendCoordinator.reset();
    onScreenShareStopped();
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
        if (controllerState.getStopInFlight() === stopPromise) {
          controllerState.setStopInFlight(null);
        }
      }

      if (stopError && propagateStopError) {
        throw stopError;
      }
    };

    const stopPromise = finalizeStop();
    controllerState.setStopInFlight(stopPromise);
    return stopPromise;
  };

  const stopInternal: ScreenCaptureController['stopInternal'] = (
    options = {},
  ) => {
    return stopCapture(options);
  };

  const start: ScreenCaptureController['start'] = async () => {
    if (controllerState.getStopInFlight()) {
      await controllerState.getStopInFlight();
    }

    const state = store.getState();
    const voiceStatus = state.voiceSessionStatus;
    const transport = getTransport();

    if (transport === null || !isLiveSessionReadyForScreenCapture(voiceStatus)) {
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

    const captureGeneration = controllerState.getNextCaptureGeneration();
    const capture = createCapture({
      onFrame: (frame: LocalScreenFrame) => {
        if (!controllerState.isCurrentCapture(capture, captureGeneration) || !getTransport()) {
          return;
        }

        onFrameCaptured?.(frame);
        frameDumpCoordinator.persistFrame(capture, captureGeneration, frame);
        void frameSendCoordinator.enqueueFrameSend(frame);
      },
      onDiagnostics: (patch: Partial<ScreenCaptureDiagnostics>) => {
        if (!controllerState.isCurrentCapture(capture, captureGeneration)) {
          return;
        }

        store.getState().setScreenCaptureDiagnostics(patch);
      },
      onError: (detail: string) => {
        if (!controllerState.isCurrentCapture(capture, captureGeneration)) {
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
    controllerState.setCapture(capture, captureGeneration);

    try {
      const startParams = getCaptureStartParams
        ? { ...SCREEN_CAPTURE_START_POLICY, ...getCaptureStartParams() }
        : SCREEN_CAPTURE_START_POLICY;
      await capture.start(startParams);

      if (!controllerState.isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      await frameDumpCoordinator.startSession(capture, captureGeneration);

      if (!controllerState.isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      store.getState().setScreenCaptureState('ready');
      store.getState().setScreenCaptureState('capturing');
      onScreenShareStarted();
    } catch (error) {
      if (!controllerState.isCurrentCapture(capture, captureGeneration)) {
        return;
      }

      const detail = asErrorDetail(error, 'Screen capture failed to start');
      if (controllerState.releaseCurrentCapture(capture, captureGeneration)) {
        frameDumpCoordinator.reset();
        frameSendCoordinator.reset();
      }
      store.getState().setScreenCaptureState('error');
      store.getState().setScreenCaptureDiagnostics({
        lastError: detail,
        lastUploadStatus: 'error',
      });
      store.getState().setLastRuntimeError(detail);
    }
  };

  const stop: ScreenCaptureController['stop'] = async () => {
    const state = store.getState();

    if (
      state.screenCaptureState === 'disabled'
      || state.screenCaptureState === 'stopping'
    ) {
      await controllerState.getStopInFlight();
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
    isActive: controllerState.isActive,
  };
}
