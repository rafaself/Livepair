import { logRuntimeError } from '../../core/logger';
import { asErrorDetail } from '../../core/runtimeUtils';
import type { LocalScreenCapture } from '../localScreenCapture';
import type { LocalScreenFrame } from '../screen.types';
import type {
  IsCurrentCapture,
  ScreenFrameDumpControls,
} from './screenCaptureControllerTypes';

export type ScreenFrameDumpCoordinator = {
  reset: () => void;
  startSession: (
    capture: LocalScreenCapture,
    generation: number,
  ) => Promise<void>;
  persistFrame: (
    capture: LocalScreenCapture,
    generation: number,
    frame: LocalScreenFrame,
  ) => void;
};

export function createScreenFrameDumpCoordinator({
  screenFrameDumpControls,
  isCurrentCapture,
  onError,
}: {
  screenFrameDumpControls: ScreenFrameDumpControls | undefined;
  isCurrentCapture: IsCurrentCapture;
  onError: (detail: string) => void;
}): ScreenFrameDumpCoordinator {
  let debugFrameDumpReady = false;

  const setScreenFrameDumpDirectoryPath = (directoryPath: string | null): void => {
    screenFrameDumpControls?.setScreenFrameDumpDirectoryPath(directoryPath);
  };

  return {
    reset: () => {
      debugFrameDumpReady = false;
    },
    startSession: async (capture, generation) => {
      debugFrameDumpReady = false;

      if (!screenFrameDumpControls?.shouldSaveFrames()) {
        return;
      }

      setScreenFrameDumpDirectoryPath(null);

      try {
        const session = await screenFrameDumpControls.startScreenFrameDumpSession();

        if (!isCurrentCapture(capture, generation)) {
          return;
        }

        debugFrameDumpReady = true;
        setScreenFrameDumpDirectoryPath(session.directoryPath);
      } catch (error) {
        if (!isCurrentCapture(capture, generation)) {
          return;
        }

        const detail = asErrorDetail(error, 'Failed to start screen frame dump');
        logRuntimeError('screen-capture', 'frame dump session start failed', { detail });
        onError(detail);
      }
    },
    persistFrame: (capture, generation, frame) => {
      if (
        !screenFrameDumpControls
        || !debugFrameDumpReady
        || !screenFrameDumpControls.shouldSaveFrames()
      ) {
        return;
      }

      void screenFrameDumpControls.saveScreenFrameDumpFrame({
        sequence: frame.sequence,
        mimeType: frame.mimeType,
        data: frame.data,
      }).catch((error) => {
        if (!isCurrentCapture(capture, generation)) {
          return;
        }

        const detail = asErrorDetail(error, 'Failed to save screen frame dump');
        logRuntimeError('screen-capture', 'frame dump save failed', {
          detail,
          sequence: frame.sequence,
        });
        onError(detail);
      });
    },
  };
}
