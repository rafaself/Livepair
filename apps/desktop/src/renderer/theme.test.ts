import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyResolvedTheme } from './theme';

describe('theme helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete document.documentElement.dataset['theme'];
    delete document.documentElement.dataset['themeTransition'];
    document.documentElement.style.colorScheme = '';

    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('applies the initial theme without enabling a transition', () => {
    applyResolvedTheme('dark');

    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.dataset['themeTransition']).toBeUndefined();
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('enables a temporary transition when switching between resolved themes', () => {
    applyResolvedTheme('dark');

    applyResolvedTheme('light');

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.dataset['themeTransition']).toBe('active');

    vi.advanceTimersByTime(319);
    expect(document.documentElement.dataset['themeTransition']).toBe('active');

    vi.advanceTimersByTime(1);
    expect(document.documentElement.dataset['themeTransition']).toBeUndefined();
  });

  it('skips the transition when reduced motion is enabled', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });

    applyResolvedTheme('dark');
    applyResolvedTheme('light');

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(document.documentElement.dataset['themeTransition']).toBeUndefined();
  });
});
