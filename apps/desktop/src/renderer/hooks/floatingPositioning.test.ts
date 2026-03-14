import { describe, expect, it } from 'vitest';
import {
  estimateFloatingContentHeight,
  resolveFloatingPosition,
} from './floatingPositioning';

describe('floatingPositioning', () => {
  it('estimates content height from item count', () => {
    expect(estimateFloatingContentHeight(4)).toBe(140);
  });

  it('positions downward when there is space below', () => {
    const triggerRect = {
      top: 100,
      left: 120,
      right: 240,
      bottom: 132,
      width: 120,
      height: 32,
      x: 120,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;

    const position = resolveFloatingPosition(
      {
        triggerRect,
        viewportWidth: 1024,
        viewportHeight: 768,
        contentHeight: 180,
      },
      {},
    );

    expect(position.placement).toBe('down');
    expect(position.left).toBe(120);
    expect(position.width).toBe(120);
    expect(position.maxHeight).toBeGreaterThan(0);
  });

  it('flips upward when below is constrained and above has more room', () => {
    const triggerRect = {
      top: 640,
      left: 100,
      right: 260,
      bottom: 672,
      width: 160,
      height: 32,
      x: 100,
      y: 640,
      toJSON: () => ({}),
    } as DOMRect;

    const position = resolveFloatingPosition(
      {
        triggerRect,
        viewportWidth: 1024,
        viewportHeight: 768,
        contentHeight: 280,
      },
      {},
    );

    expect(position.placement).toBe('up');
    expect(position.maxHeight).toBeGreaterThan(0);
  });

  it('respects explicit upward placement even when there is room below', () => {
    const triggerRect = {
      top: 100,
      left: 120,
      right: 240,
      bottom: 132,
      width: 120,
      height: 32,
      x: 120,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect;

    const position = resolveFloatingPosition(
      {
        triggerRect,
        viewportWidth: 1024,
        viewportHeight: 768,
        contentHeight: 180,
      },
      { placement: 'up' },
    );

    expect(position.placement).toBe('up');
    expect(position.maxHeight).toBeGreaterThan(0);
  });
});
