import type {
  ScreenCaptureController,
  StopScreenCaptureOptions,
} from './controller/screenCaptureControllerTypes';

export type LiveRuntimeScreenCaptureBoundary = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
  analyzeNow: () => void;
  isActive: () => boolean;
};

export type LiveRuntimeScreenBoundary = {
  stopCapture: (options?: StopScreenCaptureOptions) => Promise<void>;
  handleTransportDetached: () => void;
};

export type LiveRuntimeScreenAdapter = {
  capture: LiveRuntimeScreenCaptureBoundary;
  runtime: LiveRuntimeScreenBoundary;
};

export function createLiveRuntimeScreenAdapter(
  controller: ScreenCaptureController,
): LiveRuntimeScreenAdapter {
  return {
    capture: {
      start: controller.start,
      stop: controller.stop,
      analyzeNow: controller.analyzeScreenNow,
      isActive: controller.isActive,
    },
    runtime: {
      stopCapture: controller.stopInternal,
      handleTransportDetached: controller.resetSendChain,
    },
  };
}
