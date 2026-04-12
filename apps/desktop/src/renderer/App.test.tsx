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
  getDesktopSessionController,
  resetDesktopSessionController,
} from './runtime/sessionController';
import { useSettingsStore } from './store/settingsStore';
import { useCaptureExclusionRectsStore } from './store/captureExclusionRectsStore';
import { resetDesktopStores } from './test/store';
import { useSessionStore } from './store/sessionStore';
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
    resetDesktopSessionController();
    useSettingsStore.setState({
      settings: DEFAULT_DESKTOP_SETTINGS,
      isReady: true,
    });
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
    window.bridge.updateSettings = vi.fn().mockImplementation(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    document.documentElement.dataset['theme'] = '';
    document.documentElement.style.colorScheme = '';
    window.bridge.overlayMode = 'linux-shape';
  });

  it('wires control dock and panel visibility through the global stores', () => {
    installMatchMedia(true);
    render(<App />);

    const panelToggleButton = screen.getByRole('button', {
      name: /close panel/i,
    });
    const panel = screen.getByRole('complementary', { hidden: true });

    expect(panelToggleButton).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveAttribute('aria-hidden', 'false');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    fireEvent.click(panelToggleButton);
    expect(panel).toHaveAttribute('aria-hidden', 'true');
  });

  it('gates the first Share Screen attempt, traps focus, and resumes after confirmation', async () => {
    installMatchMedia(true);

    useSessionStore.setState({
      currentMode: 'speech',
      activeTransport: 'gemini-live',
      speechLifecycle: { status: 'listening' },
      voiceSessionStatus: 'active',
      voiceCaptureState: 'muted',
      screenCaptureState: 'disabled',
    });

    const controller = getDesktopSessionController();
    const startScreenCaptureSpy = vi.spyOn(controller, 'startScreenCapture').mockResolvedValue();

    render(<App />);

    const shareScreenButton = screen.getByRole('button', { name: 'Share screen' });
    shareScreenButton.focus();
    fireEvent.click(shareScreenButton);

    expect(startScreenCaptureSpy).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog', {
      name: 'Choose screen share mode',
    });
    const manualRadio = screen.getByRole('radio', { name: /manual/i });
    const confirmButton = screen.getByRole('button', { name: 'Confirm Share Screen mode' });

    expect(dialog).toBeVisible();
    expect(dialog.parentElement).toHaveClass('panel-dialog__frame');
    expect(dialog.parentElement).toHaveClass('share-screen-mode-dialog__frame');
    expect(dialog).toHaveAttribute('aria-describedby', 'share-screen-mode-description');
    expect(screen.getByText('Send only when you choose to share.')).toBeVisible();
    expect(confirmButton).toBeDisabled();
    expect(manualRadio).toHaveFocus();

    confirmButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(manualRadio).toHaveFocus();
    expect(shareScreenButton).not.toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(dialog).toBeVisible();

    fireEvent.click(manualRadio);
    expect(confirmButton).toBeEnabled();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        screenContextMode: 'manual',
      });
      expect(startScreenCaptureSpy).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose screen share mode' })).toBeNull();
      expect(shareScreenButton).toHaveFocus();
    });
  });

  it('closes the Share Screen mode dialog without starting capture when canceled', async () => {
    installMatchMedia(true);

    useSessionStore.setState({
      currentMode: 'speech',
      activeTransport: 'gemini-live',
      speechLifecycle: { status: 'listening' },
      voiceSessionStatus: 'active',
      voiceCaptureState: 'muted',
      screenCaptureState: 'disabled',
    });

    const controller = getDesktopSessionController();
    const startScreenCaptureSpy = vi.spyOn(controller, 'startScreenCapture').mockResolvedValue();

    render(<App />);

    const shareScreenButton = screen.getByRole('button', { name: 'Share screen' });
    shareScreenButton.focus();
    fireEvent.click(shareScreenButton);

    await screen.findByRole('dialog', {
      name: 'Choose screen share mode',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Share Screen mode' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose screen share mode' })).toBeNull();
      expect(startScreenCaptureSpy).not.toHaveBeenCalled();
      expect(window.bridge.updateSettings).not.toHaveBeenCalled();
      expect(shareScreenButton).toHaveFocus();
    });
  });

  it('opens the Share Screen mode dialog before starting a Live session with screen share from the assistant panel', async () => {
    installMatchMedia(true);
    const controller = getDesktopSessionController();
    const startSessionSpy = vi.spyOn(controller, 'startSession').mockResolvedValue();
    const startScreenCaptureSpy = vi.spyOn(controller, 'startScreenCapture').mockResolvedValue();
    const startVoiceCaptureSpy = vi.spyOn(controller, 'startVoiceCapture').mockResolvedValue();

    render(<App />);

    const assistantPanel = screen.getByRole('complementary', {
      name: 'Assistant Panel',
      hidden: true,
    });
    const shareScreenButton = within(assistantPanel).getByRole('button', { name: 'Share screen' });

    fireEvent.click(shareScreenButton);

    expect(startSessionSpy).not.toHaveBeenCalled();
    expect(startScreenCaptureSpy).not.toHaveBeenCalled();
    expect(startVoiceCaptureSpy).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog', {
      name: 'Choose screen share mode',
    });
    const manualRadio = screen.getByRole('radio', { name: /manual/i });
    const confirmButton = screen.getByRole('button', { name: 'Confirm Share Screen mode' });

    expect(dialog).toBeVisible();
    expect(dialog.parentElement).toHaveClass('panel-dialog__frame');
    expect(dialog.parentElement).toHaveClass('share-screen-mode-dialog__frame');
    expect(confirmButton).toBeDisabled();

    fireEvent.click(manualRadio);
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        screenContextMode: 'manual',
      });
      expect(startSessionSpy).toHaveBeenCalledWith({ mode: 'speech' });
      expect(startScreenCaptureSpy).toHaveBeenCalledTimes(1);
      expect(startVoiceCaptureSpy).not.toHaveBeenCalled();
    });
  });

  it('does not open the Share Screen mode dialog from the assistant panel when the mode was already configured', async () => {
    installMatchMedia(true);
    const controller = getDesktopSessionController();
    const startSessionSpy = vi.spyOn(controller, 'startSession').mockResolvedValue();
    const startScreenCaptureSpy = vi.spyOn(controller, 'startScreenCapture').mockResolvedValue();
    const startVoiceCaptureSpy = vi.spyOn(controller, 'startVoiceCapture').mockResolvedValue();

    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        screenContextMode: 'manual',
      },
      isReady: true,
    });

    render(<App />);

    const assistantPanel = screen.getByRole('complementary', {
      name: 'Assistant Panel',
      hidden: true,
    });
    const shareScreenButton = within(assistantPanel).getByRole('button', { name: 'Share screen' });

    fireEvent.click(shareScreenButton);

    await waitFor(() => {
      expect(startSessionSpy).toHaveBeenCalledWith({ mode: 'speech' });
      expect(startScreenCaptureSpy).toHaveBeenCalledTimes(1);
      expect(startVoiceCaptureSpy).not.toHaveBeenCalled();
    });

    expect(screen.queryByRole('dialog', { name: 'Choose screen share mode' })).toBeNull();
    expect(window.bridge.updateSettings).not.toHaveBeenCalled();
  });

  it('restores the assistant-panel CTA buttons after canceling the Share Screen mode dialog', async () => {
    installMatchMedia(true);
    const controller = getDesktopSessionController();
    const startSessionSpy = vi.spyOn(controller, 'startSession').mockResolvedValue();
    const startScreenCaptureSpy = vi.spyOn(controller, 'startScreenCapture').mockResolvedValue();
    const startVoiceCaptureSpy = vi.spyOn(controller, 'startVoiceCapture').mockResolvedValue();

    render(<App />);

    const assistantPanel = screen.getByRole('complementary', {
      name: 'Assistant Panel',
      hidden: true,
    });
    const talkButton = within(assistantPanel).getByRole('button', { name: 'Talk' });
    const shareScreenButton = within(assistantPanel).getByRole('button', { name: 'Share screen' });

    fireEvent.click(shareScreenButton);

    await screen.findByRole('dialog', {
      name: 'Choose screen share mode',
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel Share Screen mode' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Choose screen share mode' })).toBeNull();
      expect(within(assistantPanel).getByRole('button', { name: 'Talk' })).toBeEnabled();
      expect(within(assistantPanel).getByRole('button', { name: 'Share screen' })).toBeEnabled();
      expect(startSessionSpy).not.toHaveBeenCalled();
      expect(startScreenCaptureSpy).not.toHaveBeenCalled();
      expect(startVoiceCaptureSpy).not.toHaveBeenCalled();
    });

    expect(talkButton).toBeEnabled();
    expect(shareScreenButton).toBeEnabled();
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

  it('tracks capture exclusion rects even when the overlay uses forwarded-pointer mode', async () => {
    installMatchMedia(true);
    window.bridge.overlayMode = 'forwarded-pointer';

    render(<App />);

    const dock = screen.getByRole('toolbar', { name: 'Assistant controls' });
    const panel = screen.getByRole('complementary', { hidden: true });

    Object.defineProperty(dock, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 1500,
        y: 300,
        width: 80,
        height: 220,
        top: 300,
        left: 1500,
        right: 1580,
        bottom: 520,
        toJSON: () => ({}),
      }),
    });
    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 1580,
        y: 0,
        width: 340,
        height: 1080,
        top: 0,
        left: 1580,
        right: 1920,
        bottom: 1080,
        toJSON: () => ({}),
      }),
    });

    fireEvent(window, new Event('resize'));

    await waitFor(() => {
      expect(
        useCaptureExclusionRectsStore
          .getState()
          .rects.some((rect) => rect.x === 1500 && rect.width === 80),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(useCaptureExclusionRectsStore.getState().rects).toContainEqual({
        x: 1580,
        y: 0,
        width: 340,
        height: 1080,
      });
    });
  });

  it('shows the inactive history container CTA instead of a text form when no Live session is active', async () => {
    installMatchMedia(true);
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });

    render(<App />);

    expect(screen.getByRole('button', { name: 'Talk' })).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Send message to Livepair' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(window.bridge.requestSessionToken).not.toHaveBeenCalled();
  });

  it.each([
    'token failed',
    'Failed to request voice session token',
    'Failed to connect voice session',
  ])('shows a retry snackbar for Live session start failure: %s', async (detail) => {
    installMatchMedia(true);

    render(<App />);

    act(() => {
      useSessionStore.getState().setLastRuntimeError(detail);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't start Live session. Try again.",
    );
  });

  it.each([
    {
      detail: 'Microphone permission was denied',
      expectedMessage: 'Microphone blocked. Check permissions and try again.',
    },
    {
      detail: 'No microphone device is available',
      expectedMessage: 'No microphone available. Check your mic and try again.',
    },
    {
      detail:
        'macOS screen recording permission is denied. Enable Livepair in System Settings > Privacy & Security > Screen Recording, then restart the app.',
      expectedMessage: 'Screen sharing blocked. Check permissions and try again.',
    },
    {
      detail:
        'No screen source could be selected. Open screen share settings and choose a source before starting capture.',
      expectedMessage: 'Choose a screen to share, then try again.',
    },
    {
      detail: 'Screen sharing requires an active Live session',
      expectedMessage: 'Start Live session before sharing your screen.',
    },
  ])('shows actionable capture guidance for $detail', async ({ detail, expectedMessage }) => {
    installMatchMedia(true);

    render(<App />);

    act(() => {
      useSessionStore.getState().setLastRuntimeError(detail);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(expectedMessage);
  });

  it('shows a restart snackbar when the current Live session can no longer resume', async () => {
    installMatchMedia(true);

    render(<App />);

    act(() => {
      useSessionStore.getState().setVoiceSessionResumption({
        status: 'resumeFailed',
        lastDetail: 'token refresh failed',
      });
      useSessionStore.getState().setLastRuntimeError('token refresh failed');
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Live session expired. Start again.',
    );
  });

  it('shows recovery snackbars when a Live session reconnects after interruption', async () => {
    installMatchMedia(true);

    render(<App />);

    act(() => {
      useSessionStore.getState().setVoiceSessionResumption({
        status: 'reconnecting',
        lastDetail: 'server draining',
      });
    });

    expect(await screen.findByText('Reconnecting Live session...')).toBeVisible();

    act(() => {
      useSessionStore.getState().setVoiceSessionResumption({
        status: 'resumed',
        lastDetail: 'server draining',
      });
    });

    expect(await screen.findByText('Live session reconnected')).toBeVisible();
  });

  it('shows a restart snackbar when recovery falls back to a fresh Live session', async () => {
    installMatchMedia(true);

    render(<App />);

    act(() => {
      useSessionStore.getState().setVoiceSessionResumption({
        status: 'reconnecting',
        lastDetail: 'server draining',
      });
    });

    expect(await screen.findByText('Reconnecting Live session...')).toBeVisible();

    act(() => {
      useSessionStore.getState().setVoiceSessionResumption({
        status: 'connected',
        resumable: false,
        lastDetail: null,
      });
    });

    expect(await screen.findByText('Live session restarted')).toBeVisible();
  });

  it('ends speech mode without clearing history and returns to the inactive resume CTA', async () => {
    installMatchMedia(true);
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });

    render(<App />);

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
          modelTurn: {
            role: 'model',
            parts: [
              {
                text: 'Speech reply',
              },
            ],
          },
        },
      });
      __emitGeminiLiveSdkMessage({ serverContent: { turnComplete: true } });
    });

    expect(await screen.findByText('Speech request')).toBeVisible();
    expect((await screen.findAllByText('Speech reply'))[0]).toBeVisible();
    await waitFor(() => {
      expect(persistedMessages).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'End Live session' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Resume Live Session' })).toBeEnabled();
      expect(screen.queryByText('Start speaking')).toBeNull();
    });

    expect(screen.getByText('Speech request')).toBeVisible();
    expect(screen.getAllByText('Speech reply')[0]).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Send message to Livepair' })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});
