import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFloatingLayer } from './useFloatingLayer';

describe('useFloatingLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('opens when open is called', () => {
    const { result } = renderHook(() => useFloatingLayer());

    act(() => {
      result.current.open();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.shouldRender).toBe(true);
  });

  it('keeps rendering while closing animation runs', () => {
    const { result } = renderHook(() => useFloatingLayer({ closeAnimationMs: 120 }));

    act(() => {
      result.current.open();
      result.current.close();
    });

    expect(result.current.isClosing).toBe(true);
    expect(result.current.shouldRender).toBe(true);

    act(() => {
      vi.advanceTimersByTime(121);
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.isClosing).toBe(false);
  });
});
