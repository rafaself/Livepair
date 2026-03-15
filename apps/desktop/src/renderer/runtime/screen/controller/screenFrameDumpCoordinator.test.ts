import { describe, expect, it, vi } from 'vitest';
import type { ScreenFrameDumpControls } from './screenCaptureControllerTypes';
import { createScreenFrameDumpCoordinator } from './screenFrameDumpCoordinator';
import {
  createMockScreenCapture,
  createScreenFrame,
} from './controllerTestUtils';

function createHarness(options: {
  saveFramesEnabled?: boolean;
  isCurrentCapture?: (
    capture: ReturnType<typeof createMockScreenCapture>,
    generation: number,
  ) => boolean;
} = {}) {
  const capture = createMockScreenCapture();
  const generation = 1;
  const shouldSaveFrames = vi.fn(() => options.saveFramesEnabled ?? true);
  const startScreenFrameDumpSession = vi.fn(async () => ({
    directoryPath: '/tmp/livepair/screen-frame-dumps/current-debug-session',
  }));
  const saveScreenFrameDumpFrame = vi.fn(async () => undefined);
  const setScreenFrameDumpDirectoryPath = vi.fn();
  const onError = vi.fn();
  const controls: ScreenFrameDumpControls = {
    shouldSaveFrames,
    startScreenFrameDumpSession,
    saveScreenFrameDumpFrame,
    setScreenFrameDumpDirectoryPath,
  };
  const isCurrentCapture = vi.fn(
    options.isCurrentCapture ?? ((_capture, _generation) => true),
  );
  const coordinator = createScreenFrameDumpCoordinator({
    screenFrameDumpControls: controls,
    isCurrentCapture,
    onError,
  });

  return {
    capture,
    controls,
    coordinator,
    generation,
    isCurrentCapture,
    onError,
    saveScreenFrameDumpFrame,
    setScreenFrameDumpDirectoryPath,
    startScreenFrameDumpSession,
  };
}

describe('createScreenFrameDumpCoordinator', () => {
  it('skips dump startup when frame saving is disabled', async () => {
    const harness = createHarness({ saveFramesEnabled: false });

    await harness.coordinator.startSession(harness.capture, harness.generation);

    expect(harness.startScreenFrameDumpSession).not.toHaveBeenCalled();
    expect(harness.setScreenFrameDumpDirectoryPath).not.toHaveBeenCalled();
  });

  it('starts a fresh dump session and persists frames once ready', async () => {
    const harness = createHarness();
    const frame = createScreenFrame(3, 7);

    await harness.coordinator.startSession(harness.capture, harness.generation);

    expect(harness.setScreenFrameDumpDirectoryPath).toHaveBeenNthCalledWith(1, null);
    expect(harness.setScreenFrameDumpDirectoryPath).toHaveBeenNthCalledWith(
      2,
      '/tmp/livepair/screen-frame-dumps/current-debug-session',
    );

    harness.coordinator.persistFrame(harness.capture, harness.generation, frame);

    await vi.waitFor(() => {
      expect(harness.saveScreenFrameDumpFrame).toHaveBeenCalledWith({
        data: frame.data,
        mimeType: frame.mimeType,
        sequence: frame.sequence,
      });
    });
  });

  it('reset stops future frame persistence without clearing the directory path', async () => {
    const harness = createHarness();

    await harness.coordinator.startSession(harness.capture, harness.generation);
    harness.saveScreenFrameDumpFrame.mockClear();
    harness.setScreenFrameDumpDirectoryPath.mockClear();

    harness.coordinator.reset();
    harness.coordinator.persistFrame(
      harness.capture,
      harness.generation,
      createScreenFrame(4, 9),
    );
    await Promise.resolve();

    expect(harness.saveScreenFrameDumpFrame).not.toHaveBeenCalled();
    expect(harness.setScreenFrameDumpDirectoryPath).not.toHaveBeenCalled();
  });

  it('reports startup errors for the current capture only', async () => {
    const harness = createHarness();
    harness.startScreenFrameDumpSession.mockRejectedValueOnce(
      new Error('dump start failed'),
    );

    await harness.coordinator.startSession(harness.capture, harness.generation);

    expect(harness.onError).toHaveBeenCalledWith('dump start failed');
  });

  it('ignores startup errors after the capture becomes stale', async () => {
    const harness = createHarness({
      isCurrentCapture: () => false,
    });
    harness.startScreenFrameDumpSession.mockRejectedValueOnce(
      new Error('dump start failed'),
    );

    await harness.coordinator.startSession(harness.capture, harness.generation);

    expect(harness.onError).not.toHaveBeenCalled();
  });

  it('reports save errors for the current capture only', async () => {
    const harness = createHarness();
    harness.saveScreenFrameDumpFrame.mockRejectedValueOnce(new Error('dump save failed'));

    await harness.coordinator.startSession(harness.capture, harness.generation);
    harness.coordinator.persistFrame(
      harness.capture,
      harness.generation,
      createScreenFrame(5, 11),
    );

    await vi.waitFor(() => {
      expect(harness.onError).toHaveBeenCalledWith('dump save failed');
    });
  });
});
