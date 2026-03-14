import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../shared/settings';
import { App } from './App';
import { useSettingsStore } from './store/settingsStore';
import { resetDesktopStores } from './store/testing';
import { useUiStore } from './store/uiStore';
import { __emitGeminiLiveSdkMessage } from './test/geminiLiveSdkMock';
import { THEME_MEDIA_QUERY } from './theme';

type MatchMediaChangeListener = (event: MediaQueryListEvent) => void;
type PersistedChatMessage = {
  id: string;
  chatId: string;
  role: 'user' | 'assistant';
  contentText: string;
  createdAt: string;
  sequence: number;
};

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
  let persistedMessages: PersistedChatMessage[];

  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
    useUiStore.getState().initializeSettingsUi(DEFAULT_DESKTOP_SETTINGS);
    vi.clearAllMocks();
    persistedMessages = [];
    window.bridge.checkHealth = vi.fn(
      () => new Promise<{ status: 'ok'; timestamp: string }>(() => {}),
    );
    window.bridge.getOrCreateCurrentChat = vi.fn().mockResolvedValue({
      id: 'chat-1',
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: true,
    });
    window.bridge.getChat = vi.fn().mockImplementation(async (chatId: string) => ({
      id: chatId,
      title: null,
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:00:00.000Z',
      isCurrent: chatId === 'chat-1',
    }));
    window.bridge.listChatMessages = vi.fn().mockImplementation(async () => [...persistedMessages]);
    window.bridge.appendChatMessage = vi.fn().mockImplementation(
      async ({
        chatId,
        role,
        contentText,
      }: {
        chatId: string;
        role: 'user' | 'assistant';
        contentText: string;
      }) => {
        const nextRecord = {
          id: `${role}-message-${persistedMessages.length + 1}`,
          chatId,
          role,
          contentText,
          createdAt: `2026-03-12T09:0${persistedMessages.length + 1}:00.000Z`,
          sequence: persistedMessages.length + 1,
        };
        persistedMessages.push(nextRecord);
        return nextRecord;
      },
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

  it('shows the inactive history container CTA instead of a text form when no Live session is active', async () => {
    installMatchMedia(true);
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    });

    expect(screen.getByRole('button', { name: 'Talk' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Send message to Livepair' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(window.bridge.requestSessionToken).not.toHaveBeenCalled();
  });

  it('ends speech mode without clearing history and returns to the inactive resume CTA', async () => {
    installMatchMedia(true);
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });

    render(<App />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Talk' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Starting Live session' })).toBeDisabled();
      expect(screen.queryByRole('heading', { name: 'Current speech turn' })).toBeNull();
    });

    await act(async () => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'End Live session' })).toBeEnabled();
    });

    await act(async () => {
      __emitGeminiLiveSdkMessage({
        serverContent: {
          inputTranscription: {
            text: 'Speech request',
          },
        },
      });
      __emitGeminiLiveSdkMessage({
        serverContent: {
          outputTranscription: {
            text: 'Speech reply',
          },
        },
      });
      __emitGeminiLiveSdkMessage({ text: 'Speech reply' });
      __emitGeminiLiveSdkMessage({ serverContent: { turnComplete: true } });
    });

    expect(await screen.findByText('Speech request')).toBeVisible();
    expect(await screen.findByText('Speech reply')).toBeVisible();
    await waitFor(() => {
      expect(persistedMessages).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'End Live session' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume Live Session' })).toBeEnabled();
      expect(screen.queryByText('Start speaking')).toBeNull();
    });

    expect(screen.getByText('Speech request')).toBeVisible();
    expect(screen.getByText('Speech reply')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Send message to Livepair' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
