import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import type { DesktopBridge } from '../../shared/desktopBridge';
import { useOverlayHitRegions } from './useOverlayHitRegions';

describe('useOverlayHitRegions', () => {
  const mockSetOverlayHitRegions = vi.fn();
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
    window.bridge = {
      overlayMode: 'linux-shape',
      checkHealth: vi.fn(),
      requestSessionToken: vi.fn(),
      createChat: vi.fn(),
      getChat: vi.fn(),
      getOrCreateCurrentChat: vi.fn(),
      listChatMessages: vi.fn(),
      appendChatMessage: vi.fn(),
      createLiveSession: vi.fn(),
      listLiveSessions: vi.fn(),
      updateLiveSession: vi.fn(),
      endLiveSession: vi.fn(),
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
      setOverlayHitRegions: mockSetOverlayHitRegions,
      setOverlayPointerPassthrough: vi.fn(),
    } satisfies DesktopBridge;
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

  it('publishes a pill-shaped dock region alongside the open panel rectangle', async () => {
    createHitElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });
    createHitElement('panel panel--open', { x: 1580, y: 0, width: 340, height: 1080 });

    renderHook(() => useOverlayHitRegions());
    await Promise.resolve();

    const publishedRegions = mockSetOverlayHitRegions.mock.lastCall?.[0];
    expect(publishedRegions).toBeDefined();
    expect(publishedRegions.at(-1)).toEqual({ x: 1580, y: 0, width: 340, height: 1080 });

    const dockRegions = publishedRegions.slice(0, -1);
    expect(dockRegions.length).toBeGreaterThan(3);
    expect(dockRegions[0].x).toBeGreaterThan(1500);
    expect(dockRegions[0].width).toBeLessThan(80);
    expect(dockRegions.some((region: { x: number; width: number }) => (
      region.x === 1500 && region.width === 80
    ))).toBe(true);
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

  it('publishes updated bounds during an active panel transition', async () => {
    let nextFrameId = 0;
    const frameQueue = new Map<number, FrameRequestCallback>();

    requestAnimationFrameSpy.mockImplementation((callback: FrameRequestCallback): number => {
      nextFrameId += 1;
      frameQueue.set(nextFrameId, callback);
      return nextFrameId;
    });
    cancelAnimationFrameSpy.mockImplementation((id: number): void => {
      frameQueue.delete(id);
    });

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

    const transitionRunEvent = new Event('transitionrun', { bubbles: true });
    Object.defineProperty(transitionRunEvent, 'propertyName', { value: 'transform' });
    panel.dispatchEvent(transitionRunEvent);

    panelRect = { x: 1640, y: 0, width: 280, height: 1080 };
    const firstFrame = frameQueue.get(1);
    expect(firstFrame).toBeTypeOf('function');
    firstFrame?.(16);
    await Promise.resolve();

    expect(mockSetOverlayHitRegions).toHaveBeenLastCalledWith([
      { x: 1640, y: 0, width: 280, height: 1080 },
    ]);

    panelRect = { x: 1580, y: 0, width: 340, height: 1080 };
    const secondFrame = frameQueue.get(2);
    expect(secondFrame).toBeTypeOf('function');
    secondFrame?.(32);
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

  it('skips duplicate publishes and ignores unrelated mutations', async () => {
    const observeSpy = vi
      .spyOn(window, 'MutationObserver')
      .mockImplementation(
        (callback: MutationCallback): MutationObserver =>
          ({
            disconnect: vi.fn(),
            observe: vi.fn(),
            takeRecords: vi.fn(() => []),
            callback,
          }) as unknown as MutationObserver,
      );

    const dock = createHitElement('control-dock', { x: 1500, y: 300, width: 80, height: 220 });
    const unrelated = createHitElement('unrelated', { x: 0, y: 0, width: 10, height: 10 });

    renderHook(() => useOverlayHitRegions());
    await Promise.resolve();

    expect(mockSetOverlayHitRegions).toHaveBeenCalledTimes(1);

    const callback = observeSpy.mock.calls[0]?.[0] as MutationCallback | undefined;
    expect(callback).toBeTypeOf('function');

    callback?.(
      [
        {
          type: 'attributes',
          target: unrelated,
          addedNodes: [] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          attributeName: 'class',
          oldValue: null,
        } as unknown as MutationRecord,
      ],
      {} as MutationObserver,
    );
    await Promise.resolve();
    expect(mockSetOverlayHitRegions).toHaveBeenCalledTimes(1);

    callback?.(
      [
        {
          type: 'attributes',
          target: dock,
          addedNodes: [] as unknown as NodeList,
          removedNodes: [] as unknown as NodeList,
          attributeName: 'class',
          oldValue: null,
        } as unknown as MutationRecord,
      ],
      {} as MutationObserver,
    );
    await Promise.resolve();
    expect(mockSetOverlayHitRegions).toHaveBeenCalledTimes(1);

    observeSpy.mockRestore();
  });
});
