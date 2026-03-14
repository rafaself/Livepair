import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../shared/settings';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSessionStore } from '../../../store/sessionStore';
import { resetDesktopStores } from '../../../store/testing';
import { useUiStore } from '../../../store/uiStore';
import { AssistantPanel } from './AssistantPanel';

const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();

function AssistantPanelHarness(): JSX.Element {
  const togglePanel = useUiStore((state) => state.togglePanel);

  return (
    <>
      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <AssistantPanel />
    </>
  );
}

async function renderAssistantPanel(): Promise<ReturnType<typeof render>> {
  await act(async () => {
    useUiStore.getState().initializeSettingsUi(useSettingsStore.getState().settings);
    await useUiStore.getState().initializeDevicePreferences();
  });

  return render(<AssistantPanelHarness />);
}

describe('AssistantPanel', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        backendUrl: 'https://persisted.livepair.dev',
      },
      isReady: true,
    });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    vi.clearAllMocks();
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });
    window.bridge.requestSessionToken = vi.fn().mockResolvedValue({
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    enumerateDevices.mockReset();
    enumerateDevices.mockResolvedValue([]);
    Object.defineProperty(window.navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
  });

  it('opens settings from the header and shows hydrated values immediately', async () => {
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    });

    expect(await panelScope.findByRole('textbox', { name: /backend url/i })).toHaveValue(
      'https://persisted.livepair.dev',
    );
    expect(enumerateDevices).toHaveBeenCalledTimes(1);
  });

  it('preserves config draft state when switching away from settings and back', async () => {
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    });

    const backendUrlInput = await panelScope.findByRole('textbox', { name: /backend url/i });
    await act(async () => {
      fireEvent.change(backendUrlInput, {
        target: { value: 'https://draft.livepair.dev' },
      });
    });

    await act(async () => {
      useUiStore.getState().setPanelView('chat');
    });
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Settings' }));
    });

    expect(await panelScope.findByRole('textbox', { name: /backend url/i })).toHaveValue(
      'https://draft.livepair.dev',
    );
    expect(enumerateDevices).toHaveBeenCalledTimes(1);
  });

  it('shows developer tools only when debug mode is enabled', async () => {
    useUiStore.setState({ isDebugMode: true });
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    expect(panelScope.getByRole('button', { name: 'Developer tools' })).toBeVisible();
  });

  it('renders the debug view when debug mode is enabled', async () => {
    useUiStore.setState({ isDebugMode: true });
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Developer tools' }));
    });

    expect(await panelScope.findByRole('heading', { name: 'Developer tools' })).toBeVisible();
  });

  it('hides the debug entry point when debug mode is disabled', async () => {
    useUiStore.setState({ isDebugMode: false });
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    expect(panelScope.queryByRole('button', { name: 'Developer tools' })).toBeNull();
  });

  it('keeps speech mode on a single conversation surface before the first spoken turn arrives', async () => {
    useSessionStore.getState().setCurrentMode('speech');
    useSessionStore.getState().setSpeechLifecycle({ status: 'listening' });
    useSessionStore.getState().setAssistantState('listening');

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(panelScope.getByRole('button', { name: 'End Live session' })).toBeVisible();
    expect(
      panelScope.getByText('Your spoken turns and assistant replies will appear here.'),
    ).toBeVisible();
    expect(panelScope.queryByRole('heading', { name: 'Current speech turn' })).toBeNull();
  });

  it('fetches and shows latest session-history metadata for an opened past chat', async () => {
    useSessionStore.getState().setActiveChatId('chat-history-4');
    window.bridge.getChat = vi.fn(async (chatId: string) => ({
      id: chatId,
      title: 'System design review',
      createdAt: '2026-03-12T09:00:00.000Z',
      updatedAt: '2026-03-12T09:40:00.000Z',
      isCurrent: false,
    }));
    window.bridge.listLiveSessions = vi.fn(async () => [
      {
        id: 'live-session-history-4',
        chatId: 'chat-history-4',
        startedAt: '2026-03-12T09:10:00.000Z',
        endedAt: null,
        status: 'active' as const,
        endedReason: null,
        resumptionHandle: 'handles/live-session-history-4',
        lastResumptionUpdateAt: '2026-03-12T09:18:00.000Z',
        restorable: true,
        invalidatedAt: null,
        invalidationReason: null,
      },
    ]);

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(await panelScope.findByText('Latest Live session')).toBeVisible();
    expect(panelScope.getByText('Resume may be available')).toBeVisible();
    expect(window.bridge.listLiveSessions).toHaveBeenCalledWith('chat-history-4');
  });

  it('returns from history view to chat through a Back to chat action', async () => {
    useUiStore.setState({ panelView: 'history' });
    window.bridge.listChats = vi.fn(async () => []);

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(await panelScope.findByText('Past chats')).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Back to chat' }));
    });

    expect(await panelScope.findByText('Live session')).toBeVisible();
    expect(useUiStore.getState().panelView).toBe('chat');
  });

  it('creates a fresh persisted chat from chat view without leaking prior turns', async () => {
    useSessionStore.getState().setActiveChatId('chat-existing');
    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'turn-old-1',
        role: 'assistant',
        content: 'Leaked reply from the previous chat',
        timestamp: '09:00',
        state: 'complete',
      },
    ]);
    window.bridge.getChat = vi.fn(async (chatId: string) => {
      if (chatId === 'chat-existing') {
        return {
          id: 'chat-existing',
          title: 'Existing chat',
          createdAt: '2026-03-12T09:00:00.000Z',
          updatedAt: '2026-03-12T09:05:00.000Z',
          isCurrent: true,
        };
      }

      if (chatId === 'chat-new') {
        return {
          id: 'chat-new',
          title: null,
          createdAt: '2026-03-12T10:00:00.000Z',
          updatedAt: '2026-03-12T10:00:00.000Z',
          isCurrent: true,
        };
      }

      return null;
    });
    window.bridge.createChat = vi.fn(async () => ({
      id: 'chat-new',
      title: null,
      createdAt: '2026-03-12T10:00:00.000Z',
      updatedAt: '2026-03-12T10:00:00.000Z',
      isCurrent: true,
    }));
    window.bridge.listChatMessages = vi.fn(async (chatId: string) =>
      chatId === 'chat-new'
        ? []
        : [
            {
              id: 'message-old-1',
              chatId,
              role: 'assistant' as const,
              contentText: 'Leaked reply from the previous chat',
              createdAt: '2026-03-12T09:01:00.000Z',
              sequence: 1,
            },
          ],
    );

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(panelScope.getByText('Leaked reply from the previous chat')).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'New chat' }));
    });

    await waitFor(() => {
      expect(window.bridge.createChat).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().activeChatId).toBe('chat-new');
      expect(useUiStore.getState().panelView).toBe('chat');
    });

    expect(panelScope.queryByText('Leaked reply from the previous chat')).toBeNull();
    expect(
      panelScope.getByText('Your spoken turns and assistant replies will appear here.'),
    ).toBeVisible();
  });
});
