import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FloatingLayer } from './FloatingLayer';

describe('FloatingLayer', () => {
  it('renders content in a portal when open', () => {
    const triggerRef = { current: document.createElement('button') };
    triggerRef.current.getBoundingClientRect = () => ({
      top: 100,
      left: 80,
      right: 240,
      bottom: 132,
      width: 160,
      height: 32,
      x: 80,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(triggerRef.current);

    render(
      <FloatingLayer
        isOpen
        triggerRef={triggerRef}
        estimatedItemCount={3}
      >
        <div>Floating content</div>
      </FloatingLayer>,
    );

    expect(screen.getByText('Floating content')).toBeInTheDocument();
    expect(document.querySelector('.floating-layer')).toBeInTheDocument();
  });

  it('calls onDismiss on outside pointer down', () => {
    const onDismiss = vi.fn();
    const triggerRef = { current: document.createElement('button') };
    triggerRef.current.getBoundingClientRect = () => ({
      top: 100,
      left: 80,
      right: 240,
      bottom: 132,
      width: 160,
      height: 32,
      x: 80,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    document.body.appendChild(triggerRef.current);

    render(
      <FloatingLayer
        isOpen
        onDismiss={onDismiss}
        triggerRef={triggerRef}
        estimatedItemCount={3}
      >
        <div>Floating content</div>
      </FloatingLayer>,
    );

    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
