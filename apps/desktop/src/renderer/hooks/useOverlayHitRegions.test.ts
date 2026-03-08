import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayHitRegions } from './useOverlayHitRegions';

describe('useOverlayHitRegions', () => {
  const mockSetOverlayHitRegions = vi.fn();
  let requestAnimationFrameSpy: ReturnType<typeof vi.spyOn>;
  let cancelAnimationFrameSpy: ReturnType<typeof vi.spyOn>;

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
    window.bridge = {
      checkHealth: vi.fn(),
      requestSessionToken: vi.fn(),
      setOverlayHitRegions: mockSetOverlayHitRegions,
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
    document.body.innerHTML = '';
  });

  function createHitElement(
    className: string,
    rect: Partial<DOMRect> & Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = className;
    Object.defineProperty(el, 'getBoundingClientRect', {
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
    document.body.appendChild(el);
    return el;
  }

  it('publishes dock and open panel rectangles to preload bridge', async () => {
    createHitElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });
    createHitElement('panel panel--open', { x: 1580, y: 0, width: 340, height: 1080 });

    renderHook(() => useOverlayHitRegions());
    await Promise.resolve();

    expect(mockSetOverlayHitRegions).toHaveBeenCalledWith([
      { x: 1500, y: 300, width: 80, height: 220 },
      { x: 1580, y: 0, width: 340, height: 1080 },
    ]);
  });

  it('republishes the final panel rectangle after the open transition ends', async () => {
    let panelRect = { x: 1680, y: 0, width: 240, height: 1080 };
    const panel = createHitElement('panel panel--open', panelRect);

    Object.defineProperty(panel, 'getBoundingClientRect', {
      value: () => ({
        x: panelRect.x,
        y: panelRect.y,
        width: panelRect.width,
        height: panelRect.height,
        top: panelRect.y,
        left: panelRect.x,
        right: panelRect.x + panelRect.width,
        bottom: panelRect.y + panelRect.height,
        toJSON: () => ({}),
      }),
    });

    renderHook(() => useOverlayHitRegions());
    await Promise.resolve();

    panelRect = { x: 1580, y: 0, width: 340, height: 1080 };
    const transitionEndEvent = new Event('transitionend', { bubbles: true });
    Object.defineProperty(transitionEndEvent, 'propertyName', { value: 'transform' });
    panel.dispatchEvent(transitionEndEvent);
    await Promise.resolve();

    expect(mockSetOverlayHitRegions).toHaveBeenLastCalledWith([
      { x: 1580, y: 0, width: 340, height: 1080 },
    ]);
  });

  it('does not throw when bridge is unavailable', () => {
    // @ts-expect-error testing graceful degradation
    delete window.bridge;

    createHitElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });

    expect(() => renderHook(() => useOverlayHitRegions())).not.toThrow();
  });
});
