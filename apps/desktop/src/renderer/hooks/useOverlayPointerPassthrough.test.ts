import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockDesktopBridge } from '../test/bridgeMocks';
import { useOverlayPointerPassthrough } from './useOverlayPointerPassthrough';

describe('useOverlayPointerPassthrough', () => {
  const mockSetOverlayPointerPassthrough = vi.fn();

  beforeEach(() => {
    document.body.innerHTML = '';
    window.bridge = createMockDesktopBridge({
      overlayMode: 'forwarded-pointer',
      setOverlayPointerPassthrough: mockSetOverlayPointerPassthrough,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  function createElement(className: string): HTMLElement {
    const element = document.createElement('div');
    element.className = className;
    document.body.appendChild(element);
    return element;
  }

  it('disables passthrough while pointer or focus is inside the interactive overlay', () => {
    const dock = createElement('control-dock');
    const panel = createElement('panel panel--open');

    renderHook(() => useOverlayPointerPassthrough());

    expect(mockSetOverlayPointerPassthrough).toHaveBeenNthCalledWith(1, true);

    fireEvent.pointerOver(dock);
    expect(mockSetOverlayPointerPassthrough).toHaveBeenNthCalledWith(2, false);

    const pointerOutEvent = new Event('pointerout', { bubbles: true });
    Object.defineProperty(pointerOutEvent, 'relatedTarget', { value: panel });
    dock.dispatchEvent(pointerOutEvent);
    expect(mockSetOverlayPointerPassthrough).toHaveBeenCalledTimes(2);

    fireEvent.focusIn(panel);
    expect(mockSetOverlayPointerPassthrough).toHaveBeenCalledTimes(2);
  });

  it('re-enables passthrough when pointer and focus leave the interactive overlay', () => {
    const dock = createElement('control-dock');
    const outside = createElement('outside');

    renderHook(() => useOverlayPointerPassthrough());

    fireEvent.pointerOver(dock);
    expect(mockSetOverlayPointerPassthrough).toHaveBeenLastCalledWith(false);

    fireEvent.pointerOut(dock, { relatedTarget: outside });
    expect(mockSetOverlayPointerPassthrough).toHaveBeenLastCalledWith(true);

    fireEvent.pointerOver(dock);
    fireEvent.focusIn(dock);
    fireEvent.focusOut(dock, { relatedTarget: outside });
    expect(mockSetOverlayPointerPassthrough).toHaveBeenLastCalledWith(true);

    fireEvent.pointerOver(dock);
    fireEvent(window, new Event('blur'));
    expect(mockSetOverlayPointerPassthrough).toHaveBeenLastCalledWith(true);
  });
});
