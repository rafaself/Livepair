import type { LocalScreenCapture } from '../localScreenCapture';
import type { ScreenCaptureDiagnostics } from '../screen.types';
import type { ActiveScreenCapture } from './screenCaptureControllerTypes';

export type ScreenCaptureControllerState = {
  getActiveCapture: () => ActiveScreenCapture | null;
  getCapture: () => LocalScreenCapture | null;
  getNextCaptureGeneration: () => number;
  setCapture: (capture: LocalScreenCapture, generation: number) => void;
  clearCapture: () => void;
  releaseCurrentCapture: (
    capture: LocalScreenCapture,
    generation: number,
  ) => boolean;
  isCurrentCapture: (
    capture: LocalScreenCapture,
    generation: number,
  ) => boolean;
  isActive: () => boolean;
  getStopInFlight: () => Promise<void> | null;
  setStopInFlight: (stopInFlight: Promise<void> | null) => void;
};

export function createEmptyScreenCaptureDiagnostics(): ScreenCaptureDiagnostics {
  return {
    captureSource: null,
    frameCount: 0,
    frameRateHz: null,
    widthPx: null,
    heightPx: null,
    lastFrameAt: null,
    lastUploadStatus: 'idle',
    lastError: null,
  };
}

export function createScreenCaptureControllerState(): ScreenCaptureControllerState {
  let screenCapture: LocalScreenCapture | null = null;
  let screenCaptureGeneration = 0;
  let stopInFlight: Promise<void> | null = null;

  return {
    getActiveCapture: () => {
      if (!screenCapture) {
        return null;
      }

      return {
        capture: screenCapture,
        generation: screenCaptureGeneration,
      };
    },
    getCapture: () => screenCapture,
    getNextCaptureGeneration: () => screenCaptureGeneration + 1,
    setCapture: (capture, generation) => {
      screenCapture = capture;
      screenCaptureGeneration = generation;
    },
    clearCapture: () => {
      if (!screenCapture) {
        return;
      }

      screenCapture = null;
      screenCaptureGeneration += 1;
    },
    releaseCurrentCapture: (capture, generation) => {
      if (screenCapture !== capture || screenCaptureGeneration !== generation) {
        return false;
      }

      screenCapture = null;
      screenCaptureGeneration += 1;
      return true;
    },
    isCurrentCapture: (capture, generation) => {
      return screenCapture === capture && screenCaptureGeneration === generation;
    },
    isActive: () => screenCapture !== null,
    getStopInFlight: () => stopInFlight,
    setStopInFlight: (nextStopInFlight) => {
      stopInFlight = nextStopInFlight;
    },
  };
}
