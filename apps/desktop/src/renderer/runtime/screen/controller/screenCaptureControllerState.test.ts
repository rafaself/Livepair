import { describe, expect, it } from 'vitest';
import {
  createEmptyScreenCaptureDiagnostics,
  createScreenCaptureControllerState,
} from './screenCaptureControllerState';
import { createMockScreenCapture } from './controllerTestUtils';

describe('createEmptyScreenCaptureDiagnostics', () => {
  it('returns the zeroed screen capture diagnostics shape', () => {
    expect(createEmptyScreenCaptureDiagnostics()).toEqual({
      captureSource: null,
      frameCount: 0,
      frameRateHz: null,
      widthPx: null,
      heightPx: null,
      lastFrameAt: null,
      overlayMaskActive: false,
      maskedRectCount: 0,
      lastMaskedFrameAt: null,
      maskReason: 'hidden',
      lastUploadStatus: 'idle',
      lastError: null,
    });
  });
});

describe('createScreenCaptureControllerState', () => {
  it('tracks the active capture and generation together', () => {
    const state = createScreenCaptureControllerState();
    const capture = createMockScreenCapture();
    const generation = state.getNextCaptureGeneration();

    state.setCapture(capture, generation);

    expect(state.getCapture()).toBe(capture);
    expect(state.getActiveCapture()).toEqual({ capture, generation });
    expect(state.isCurrentCapture(capture, generation)).toBe(true);
    expect(state.isActive()).toBe(true);
  });

  it('clearCapture deactivates the current capture and invalidates its generation', () => {
    const state = createScreenCaptureControllerState();
    const capture = createMockScreenCapture();
    const generation = state.getNextCaptureGeneration();

    state.setCapture(capture, generation);
    state.clearCapture();

    expect(state.getCapture()).toBeNull();
    expect(state.getActiveCapture()).toBeNull();
    expect(state.isCurrentCapture(capture, generation)).toBe(false);
    expect(state.isActive()).toBe(false);
  });

  it('releaseCurrentCapture only clears the matching capture and generation', () => {
    const state = createScreenCaptureControllerState();
    const capture = createMockScreenCapture();
    const otherCapture = createMockScreenCapture();
    const generation = state.getNextCaptureGeneration();

    state.setCapture(capture, generation);

    expect(state.releaseCurrentCapture(otherCapture, generation)).toBe(false);
    expect(state.releaseCurrentCapture(capture, generation + 1)).toBe(false);
    expect(state.isActive()).toBe(true);

    expect(state.releaseCurrentCapture(capture, generation)).toBe(true);
    expect(state.isActive()).toBe(false);
    expect(state.getActiveCapture()).toBeNull();
  });

  it('stores stopInFlight independently from capture activity', () => {
    const state = createScreenCaptureControllerState();
    const stopInFlight = Promise.resolve();

    state.setStopInFlight(stopInFlight);
    expect(state.getStopInFlight()).toBe(stopInFlight);

    state.setStopInFlight(null);
    expect(state.getStopInFlight()).toBeNull();
  });
});
