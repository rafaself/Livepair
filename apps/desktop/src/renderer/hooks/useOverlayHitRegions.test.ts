import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useOverlayHitRegions } from './useOverlayHitRegions';

describe('useOverlayHitRegions', () => {
  const mockSetOverlayHitRegions = vi.fn();

  beforeEach(() => {
    window.bridge = {
      checkHealth: vi.fn(),
      requestSessionToken: vi.fn(),
      setOverlayHitRegions: mockSetOverlayHitRegions,
    };
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  function createHitElement(
    className: string,
    rect: Partial<DOMRect> & Pick<DOMRect, 'x' | 'y' | 'width' | 'height'>,
  ): HTMLElement {
    const el = document.createElement('div');
    el.className = className;
    Object.defineProperty(el, 'getBoundingClientRect', {
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

  it('does not throw when bridge is unavailable', () => {
    // @ts-expect-error testing graceful degradation
    delete window.bridge;

    createHitElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });

    expect(() => renderHook(() => useOverlayHitRegions())).not.toThrow();
  });
});
