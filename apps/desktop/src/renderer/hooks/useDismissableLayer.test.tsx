import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useDismissableLayer } from './useDismissableLayer';

describe('useDismissableLayer', () => {
  it('dismisses on outside pointer down', () => {
    const onDismiss = vi.fn();

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      useDismissableLayer({
        enabled: true,
        containerRef,
        onDismiss,
      });
      return { containerRef };
    });

    const inside = document.createElement('div');
    const outside = document.createElement('div');
    document.body.appendChild(inside);
    document.body.appendChild(outside);
    result.current.containerRef.current = inside;

    fireEvent.pointerDown(outside);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss on inside pointer down', () => {
    const onDismiss = vi.fn();

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      useDismissableLayer({
        enabled: true,
        containerRef,
        onDismiss,
      });
      return { containerRef };
    });

    const inside = document.createElement('div');
    document.body.appendChild(inside);
    result.current.containerRef.current = inside;

    fireEvent.pointerDown(inside);

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('calls onEscape when escape is pressed', () => {
    const onDismiss = vi.fn();
    const onEscape = vi.fn();

    renderHook(() => {
      const containerRef = useRef<HTMLDivElement | null>(null);
      useDismissableLayer({
        enabled: true,
        containerRef,
        onDismiss,
        onEscape,
      });
      return { containerRef };
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onEscape).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('dismisses when focus moves outside the owned refs', () => {
    const onDismiss = vi.fn();

    const { result } = renderHook(() => {
      const containerRef = useRef<HTMLButtonElement | null>(null);
      const extraRef = useRef<HTMLDivElement | null>(null);
      useDismissableLayer({
        enabled: true,
        containerRef,
        extraRefs: [extraRef],
        onDismiss,
      });
      return { containerRef, extraRef };
    });

    const trigger = document.createElement('button');
    const content = document.createElement('div');
    const outside = document.createElement('button');
    document.body.appendChild(trigger);
    document.body.appendChild(content);
    document.body.appendChild(outside);
    result.current.containerRef.current = trigger;
    result.current.extraRef.current = content;

    trigger.focus();
    outside.focus();

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
