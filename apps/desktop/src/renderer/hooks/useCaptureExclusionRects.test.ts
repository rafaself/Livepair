import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { useCaptureExclusionRectsStore } from '../store/captureExclusionRectsStore';
import { useCaptureExclusionRects } from './useCaptureExclusionRects';

describe('useCaptureExclusionRects', () => {
  let requestAnimationFrameSpy: MockInstance<(callback: FrameRequestCallback) => number>;
  let cancelAnimationFrameSpy: MockInstance<(id: number) => void>;

  beforeEach(() => {
    requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback): number => {
        callback(0);
        return 1;
      });
    cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((): void => {});
    useCaptureExclusionRectsStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    useCaptureExclusionRectsStore.getState().reset();
    vi.clearAllMocks();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    document.body.innerHTML = '';
  });

  function createOverlayElement(
    className: string,
    rect: Partial<DOMRect> & Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>,
  ): HTMLElement {
    const element = document.createElement('div');
    element.className = className;
    Object.defineProperty(element, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        top: rect.y,
        left: rect.x,
        right: rect.x + rect.width,
        bottom: rect.y + rect.height,
        toJSON: () => ({}),
      }),
    });
    document.body.appendChild(element);
    return element;
  }

  it('tracks dock-only rects and adds/removes the open panel rects as visibility changes', async () => {
    createOverlayElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });
    const panel = createOverlayElement('panel', { x: 1580, y: 0, width: 340, height: 1080 });

    renderHook(() => useCaptureExclusionRects());

    await waitFor(() => {
      const rects = useCaptureExclusionRectsStore.getState().rects;
      expect(rects.length).toBeGreaterThan(0);
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe('panel-closed-dock-only');
      expect(rects.some((rect) => rect.x === 1580 && rect.width === 340)).toBe(false);
      expect(rects.some((rect) => rect.x === 1500 && rect.width === 80)).toBe(true);
    });

    panel.className = 'panel panel--open';

    await waitFor(() => {
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe('panel-open');
      expect(useCaptureExclusionRectsStore.getState().rects).toContainEqual({
        x: 1580,
        y: 0,
        width: 340,
        height: 1080,
      });
    });

    panel.className = 'panel';

    await waitFor(() => {
      const rects = useCaptureExclusionRectsStore.getState().rects;
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe('panel-closed-dock-only');
      expect(rects.some((rect) => rect.x === 1580 && rect.width === 340)).toBe(false);
      expect(rects.some((rect) => rect.x === 1500 && rect.width === 80)).toBe(true);
    });
  });

  it('stores an empty rect list when no visible exclusion overlay UI exists', async () => {
    renderHook(() => useCaptureExclusionRects());

    await waitFor(() => {
      expect(useCaptureExclusionRectsStore.getState().rects).toEqual([]);
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe('hidden');
    });
  });

  it('continues masking the panel during its CSS closing transition', async () => {
    createOverlayElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });
    const panel = createOverlayElement('panel panel--open', { x: 1580, y: 0, width: 340, height: 1080 });

    renderHook(() => useCaptureExclusionRects());

    await waitFor(() => {
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe('panel-open');
    });

    // Simulate the browser removing panel--open and immediately starting the CSS transition.
    // In a real browser, transitionrun fires on .panel (without panel--open) as the
    // translateX animation begins.
    panel.className = 'panel';
    panel.dispatchEvent(new Event('transitionrun', { bubbles: true }));

    await waitFor(() => {
      const rects = useCaptureExclusionRectsStore.getState().rects;
      // Panel rects must still be present so masking covers the sliding panel.
      expect(rects.some((rect) => rect.x === 1580 && rect.width === 340)).toBe(true);
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).not.toBe('hidden');
    });

    // Simulate the transition completing (panel fully off-screen).
    panel.dispatchEvent(new Event('transitionend', { bubbles: true }));

    await waitFor(() => {
      const rects = useCaptureExclusionRectsStore.getState().rects;
      expect(rects.some((rect) => rect.x === 1580 && rect.width === 340)).toBe(false);
      expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe(
        'panel-closed-dock-only',
      );
    });
  });

  it('clears exclusion rects on unmount', async () => {
    createOverlayElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });

    const { unmount } = renderHook(() => useCaptureExclusionRects());

    await waitFor(() => {
      expect(useCaptureExclusionRectsStore.getState().rects.length).toBeGreaterThan(0);
    });

    unmount();

    expect(useCaptureExclusionRectsStore.getState().rects).toEqual([]);
    expect(useCaptureExclusionRectsStore.getState().overlayVisibility).toBe('hidden');
  });
});
