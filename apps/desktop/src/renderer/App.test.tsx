import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { checkBackendHealth } from './api/backend';
import { App } from './App';
import { useSettingsStore } from './store/settingsStore';
import { resetDesktopStores } from './store/testing';
import { useUiStore } from './store/uiStore';
import { THEME_MEDIA_QUERY } from './theme';
import type { OverlayWindowState } from '../shared/desktopBridge';

vi.mock('./api/backend', () => ({
  checkBackendHealth: vi.fn(),
  requestSessionToken: vi.fn(),
}));

type MatchMediaChangeListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean): {
  change: (matches: boolean) => void;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  matchMedia: ReturnType<typeof vi.fn>;
} {
  let matches = initialMatches;
  const listeners = new Set<MatchMediaChangeListener>();
  const addEventListener = vi.fn((eventName: string, listener: MatchMediaChangeListener) => {
    if (eventName === 'change') {
      listeners.add(listener);
    }
  });
  const removeEventListener = vi.fn((eventName: string, listener: MatchMediaChangeListener) => {
    if (eventName === 'change') {
      listeners.delete(listener);
    }
  });
  const mediaQueryList = {
    get matches() {
      return matches;
    },
    media: THEME_MEDIA_QUERY,
    addEventListener,
    removeEventListener,
  };
  const matchMedia = vi.fn().mockReturnValue(mediaQueryList);

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });

  return {
    addEventListener,
    removeEventListener,
    matchMedia,
    change: (nextMatches: boolean) => {
      matches = nextMatches;
      const event = { matches: nextMatches, media: THEME_MEDIA_QUERY } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

describe('App', () => {
  let overlayWindowStateListener: ((state: OverlayWindowState) => void) | null = null;

  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    useUiStore.getState().initializeSettingsUi(DEFAULT_DESKTOP_SETTINGS);
    vi.clearAllMocks();
    vi.mocked(checkBackendHealth).mockImplementation(() => new Promise<boolean>(() => {}));
    document.documentElement.dataset['theme'] = '';
    document.documentElement.style.colorScheme = '';
    window.bridge.overlayMode = 'linux-shape';
    window.bridge.getOverlayWindowState = vi.fn(async () => ({
      isFocused: false,
      isVisible: false,
      isInteractive: false,
    }));
    window.bridge.onOverlayWindowState = vi.fn((listener) => {
      overlayWindowStateListener = listener;
      return () => {
        overlayWindowStateListener = null;
      };
    });
  });

  it('wires control dock and panel visibility through the global stores', () => {
    installMatchMedia(true);
    render(<App />);

    const panelToggleOpen = screen.getByRole('button', {
      name: /open panel/i,
    });
    const panel = screen.getByRole('complementary', { hidden: true });

    expect(panelToggleOpen).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveAttribute('aria-hidden', 'true');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    fireEvent.click(panelToggleOpen);
    expect(panel).toHaveAttribute('aria-hidden', 'false');
  });

  it('updates the applied theme when the system preference changes and cleans up listeners', () => {
    const matchMedia = installMatchMedia(true);
    const { unmount } = render(<App />);

    expect(matchMedia.matchMedia).toHaveBeenCalledWith(THEME_MEDIA_QUERY);
    expect(matchMedia.addEventListener).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset['theme']).toBe('dark');

    matchMedia.change(false);
    expect(document.documentElement.dataset['theme']).toBe('light');

    unmount();
    expect(matchMedia.removeEventListener).toHaveBeenCalledTimes(1);
  });

  it('respects an explicit light theme and the forwarded-pointer overlay mode', () => {
    const matchMedia = installMatchMedia(true);
    window.bridge.overlayMode = 'forwarded-pointer';
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        themePreference: 'light',
      },
      isReady: true,
    });

    render(<App />);

    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(matchMedia.addEventListener).not.toHaveBeenCalled();

    matchMedia.change(false);
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(window.bridge.setOverlayPointerPassthrough).toHaveBeenCalled();
  });

  it('syncs linux overlay interactivity and closes the panel on native blur when unpinned', async () => {
    installMatchMedia(true);
    render(<App />);

    expect(window.bridge.getOverlayWindowState).toHaveBeenCalledTimes(1);
    expect(window.bridge.onOverlayWindowState).toHaveBeenCalledTimes(1);
    expect(window.bridge.setOverlayInteractive).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    expect(window.bridge.setOverlayInteractive).toHaveBeenLastCalledWith(true);

    act(() => {
      overlayWindowStateListener?.({
        isFocused: false,
        isVisible: true,
        isInteractive: true,
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /open panel/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
    expect(window.bridge.setOverlayInteractive).toHaveBeenLastCalledWith(false);
  });

  it('closes the unpinned panel when clicking the overlay outside the dock and panel', () => {
    installMatchMedia(true);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    expect(screen.getByRole('button', { name: /close panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );

    const appShell = document.querySelector('.app-shell');
    expect(appShell).not.toBeNull();

    fireEvent.pointerDown(appShell!);

    expect(screen.getByRole('button', { name: /open panel/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('keeps the panel open when switching to settings inside the panel', () => {
    installMatchMedia(true);
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.getByRole('button', { name: /close panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });
});
