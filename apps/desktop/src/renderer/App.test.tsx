import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { App } from './App';
import {
  __emitGeminiLiveSdkClose,
  __emitGeminiLiveSdkMessage,
  __getLastGeminiLiveSdkConnectOptions,
  __getLastGeminiLiveSdkSession,
  __resetGeminiLiveSdkMock,
} from './test/geminiLiveSdkMock';
import { useSettingsStore } from './store/settingsStore';
import { resetDesktopStores } from './store/testing';
import { useUiStore } from './store/uiStore';
import { THEME_MEDIA_QUERY } from './theme';

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
  beforeEach(() => {
    resetDesktopStores();
    __resetGeminiLiveSdkMock();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    useUiStore.getState().initializeSettingsUi(DEFAULT_DESKTOP_SETTINGS);
    vi.clearAllMocks();
    window.bridge.checkHealth = vi.fn(
      () => new Promise<{ status: 'ok'; timestamp: string }>(() => {}),
    );
    window.bridge.requestSessionToken = vi.fn().mockResolvedValue({
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    document.documentElement.dataset['theme'] = '';
    document.documentElement.style.colorScheme = '';
    window.bridge.overlayMode = 'linux-shape';
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

  it('streams a text-first realtime turn through the app shell and surfaces disconnect failures', async () => {
    installMatchMedia(true);
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    });
    const composerForm = screen.getByRole('form', {
      name: 'Send message to Livepair',
    });

    await act(async () => {
      fireEvent.change(within(composerForm).getByRole('textbox'), {
        target: { value: 'Summarize the current screen' },
      });
    });

    await act(async () => {
      fireEvent.submit(composerForm);
    });

    await waitFor(() => {
      expect(__getLastGeminiLiveSdkConnectOptions()).toBeDefined();
    });

    const session = __getLastGeminiLiveSdkSession();

    act(() => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(session.sendClientContent).toHaveBeenCalledWith({
        turns: [
          {
            role: 'user',
            parts: [{ text: 'Summarize the current screen' }],
          },
        ],
        turnComplete: true,
      });
    });

    act(() => {
      __emitGeminiLiveSdkMessage({
        serverContent: {
          interrupted: false,
          turnComplete: false,
        },
        text: 'Here is the streamed response.',
      });
      __emitGeminiLiveSdkMessage({
        serverContent: {
          interrupted: false,
          turnComplete: true,
        },
      });
    });

    expect(await screen.findByText('Here is the streamed response.')).toBeVisible();

    act(() => {
      __emitGeminiLiveSdkMessage({
        serverContent: {
          interrupted: false,
          turnComplete: false,
        },
        text: 'Partial retry',
      });
      __emitGeminiLiveSdkClose('transport offline');
    });

    expect(await screen.findByText('transport offline')).toBeVisible();
    expect(screen.getByText('Partial retry')).toBeVisible();
  });
});
