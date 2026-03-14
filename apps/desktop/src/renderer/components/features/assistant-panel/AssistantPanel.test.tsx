import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../../shared/settings';
import { useSettingsStore } from '../../../store/settingsStore';
import { useSessionStore } from '../../../store/sessionStore';
import { resetDesktopStores } from '../../../store/testing';
import { useUiStore } from '../../../store/uiStore';
import { AssistantPanel } from './AssistantPanel';

const enumerateDevices = vi.fn<() => Promise<MediaDeviceInfo[]>>();

function createDevice(
  overrides: Partial<MediaDeviceInfo> & Pick<MediaDeviceInfo, 'deviceId' | 'kind'>,
): MediaDeviceInfo {
  return {
    deviceId: overrides.deviceId,
    groupId: overrides.groupId ?? `${overrides.deviceId}-group`,
    kind: overrides.kind,
    label: overrides.label ?? overrides.deviceId,
    toJSON: overrides.toJSON ?? (() => ({})),
  } satisfies MediaDeviceInfo;
}

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
    useUiStore.setState({ isDebugMode: true });
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
    useUiStore.setState({ isDebugMode: true });
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
    expect(panelScope.getByRole('switch', { name: 'Save screen frames' })).toBeVisible();
  });

  it('hides the debug entry point when debug mode is disabled', async () => {
    useUiStore.setState({ isDebugMode: false });
    useSessionStore.getState().setRealtimeOutboundDiagnostics({
      breakerState: 'open',
      breakerReason: 'transport unavailable',
      consecutiveFailureCount: 3,
      totalSubmitted: 4,
      sentCount: 1,
      droppedCount: 1,
      replacedCount: 1,
      blockedCount: 1,
      droppedByReason: {
        staleSequence: 1,
        laneSaturated: 0,
      },
      blockedByReason: {
        breakerOpen: 1,
      },
      submittedByKind: {
        text: 1,
        audioChunk: 1,
        visualFrame: 2,
      },
      lastDecision: 'block',
      lastReason: 'breaker-open',
      lastEventKind: 'text',
      lastChannelKey: 'text:speech-mode',
      lastSequence: 2,
      lastReplaceKey: null,
      lastSubmittedAtMs: 1_000,
      lastError: 'transport unavailable',
    });
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    expect(panelScope.queryByRole('button', { name: 'Developer tools' })).toBeNull();
    expect(panelScope.queryByText('Outbound guardrails')).toBeNull();
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
    const sharedHeader = panel.querySelector('.assistant-panel__inner-header');

    expect(sharedHeader).not.toBeNull();
    expect(await panelScope.findByText('No past chats yet.')).toBeVisible();
    expect(within(sharedHeader as HTMLDivElement).queryByText(/session history/i)).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'History' })).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'New chat' })).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'Refresh history' })).toBeNull();

    await act(async () => {
      fireEvent.click(within(sharedHeader as HTMLDivElement).getByRole('button', { name: 'Back to chat' }));
    });

    expect(await panelScope.findByText('Talk to Livepair')).toBeVisible();
    expect(useUiStore.getState().panelView).toBe('chat');
  });

  it('shows history and new chat actions in the shared chat header without a Session History label', async () => {
    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    const contentShell = panel.querySelector('.assistant-panel__inner-shell');
    const sharedHeader = panel.querySelector('.assistant-panel__inner-header');
    const sharedBody = panel.querySelector('.assistant-panel__inner-body');

    expect(contentShell).not.toBeNull();
    expect(panel.querySelectorAll('.assistant-panel__inner-shell')).toHaveLength(1);
    expect(sharedHeader).not.toBeNull();
    expect(panel.querySelectorAll('.assistant-panel__inner-header')).toHaveLength(1);
    expect(sharedBody).not.toBeNull();
    expect(panel.querySelectorAll('.assistant-panel__inner-body')).toHaveLength(1);
    expect(within(sharedHeader as HTMLDivElement).queryByText(/session history/i)).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).getAllByRole('button')).toHaveLength(2);
    expect(sharedHeader).toContainElement(within(sharedHeader as HTMLDivElement).getByRole('button', { name: 'History' }));
    expect(sharedHeader).toContainElement(within(sharedHeader as HTMLDivElement).getByRole('button', { name: 'New chat' }));
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'Back to chat' })).toBeNull();
    expect(sharedBody).toContainElement(panelScope.getByText('Talk to Livepair'));
  });

  it('keeps the shared inner header structure fixed while switching between chat and history', async () => {
    window.bridge.listChats = vi.fn(async () => []);

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    const sharedShell = panel.querySelector('.assistant-panel__inner-shell');
    const sharedHeader = panel.querySelector('.assistant-panel__inner-header');
    const sharedHeaderContent = panel.querySelector('.assistant-panel__inner-header-content');
    const sharedHeaderActions = panel.querySelector('.assistant-panel__inner-header-actions');
    const sharedBody = panel.querySelector('.assistant-panel__inner-body');

    expect(sharedShell).not.toBeNull();
    expect(sharedHeader).not.toBeNull();
    expect(sharedHeaderContent).not.toBeNull();
    expect(sharedHeaderActions).not.toBeNull();
    expect(sharedBody).not.toBeNull();
    expect(sharedBody).toContainElement(panelScope.getByText('Talk to Livepair'));

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'History' }));
    });

    expect(await panelScope.findByText('No past chats yet.')).toBeVisible();
    expect(panel.querySelectorAll('.assistant-panel__inner-shell')).toHaveLength(1);
    expect(panel.querySelector('.assistant-panel__inner-shell')).toBe(sharedShell);
    expect(panel.querySelectorAll('.assistant-panel__inner-header')).toHaveLength(1);
    expect(panel.querySelector('.assistant-panel__inner-header')).toBe(sharedHeader);
    expect(panel.querySelectorAll('.assistant-panel__inner-header-content')).toHaveLength(1);
    expect(panel.querySelector('.assistant-panel__inner-header-content')).toBe(sharedHeaderContent);
    expect(panel.querySelectorAll('.assistant-panel__inner-header-actions')).toHaveLength(1);
    expect(panel.querySelector('.assistant-panel__inner-header-actions')).toBe(sharedHeaderActions);
    expect(panel.querySelectorAll('.assistant-panel__inner-body')).toHaveLength(1);
    expect(panel.querySelector('.assistant-panel__inner-body')).toBe(sharedBody);
    expect(within(sharedHeader as HTMLDivElement).queryByText(/session history/i)).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).queryByText('Past chats')).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).getAllByRole('button')).toHaveLength(1);
    expect(sharedHeader).toContainElement(within(sharedHeader as HTMLDivElement).getByRole('button', { name: 'Back to chat' }));
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'History' })).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'New chat' })).toBeNull();
    expect(within(sharedHeader as HTMLDivElement).queryByRole('button', { name: 'Refresh history' })).toBeNull();
    expect(sharedBody).toContainElement(panelScope.getByText('No past chats yet.'));
    expect(within(sharedBody as HTMLDivElement).queryByText('Talk to Livepair')).toBeNull();
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
  });

  it('creates a new empty chat from an opened past chat without leaking past metadata or turns', async () => {
    useSessionStore.getState().setActiveChatId('chat-past-open');
    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'turn-past-1',
        role: 'assistant',
        content: 'Past-session reply that should disappear',
        timestamp: '09:00',
        state: 'complete',
      },
    ]);
    window.bridge.getChat = vi.fn(async (chatId: string) => {
      if (chatId === 'chat-past-open') {
        return {
          id: 'chat-past-open',
          title: 'Retrospective notes',
          createdAt: '2026-03-12T08:00:00.000Z',
          updatedAt: '2026-03-12T08:30:00.000Z',
          isCurrent: false,
        };
      }

      if (chatId === 'chat-new-from-past') {
        return {
          id: 'chat-new-from-past',
          title: null,
          createdAt: '2026-03-12T10:00:00.000Z',
          updatedAt: '2026-03-12T10:00:00.000Z',
          isCurrent: true,
        };
      }

      return null;
    });
    window.bridge.createChat = vi.fn(async () => ({
      id: 'chat-new-from-past',
      title: null,
      createdAt: '2026-03-12T10:00:00.000Z',
      updatedAt: '2026-03-12T10:00:00.000Z',
      isCurrent: true,
    }));
    window.bridge.listLiveSessions = vi.fn(async (chatId: string) =>
      chatId === 'chat-past-open'
        ? [
            {
              id: 'live-session-past-open',
              chatId,
              startedAt: '2026-03-12T08:05:00.000Z',
              endedAt: null,
              status: 'active' as const,
              endedReason: null,
              resumptionHandle: 'handles/live-session-past-open',
              lastResumptionUpdateAt: '2026-03-12T08:10:00.000Z',
              restorable: true,
              invalidatedAt: null,
              invalidationReason: null,
            },
          ]
        : [],
    );

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(await panelScope.findByText('Retrospective notes')).toBeVisible();
    expect(panelScope.getByText('Latest Live session')).toBeVisible();
    expect(panelScope.getByText('Resume may be available')).toBeVisible();
    expect(panelScope.getByText('Past-session reply that should disappear')).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'New chat' }));
    });

    await waitFor(() => {
      expect(window.bridge.createChat).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().activeChatId).toBe('chat-new-from-past');
      expect(useUiStore.getState().panelView).toBe('chat');
    });

    expect(panelScope.queryByText('Retrospective notes')).toBeNull();
    expect(panelScope.queryByText('Latest Live session')).toBeNull();
    expect(panelScope.queryByText('Resume may be available')).toBeNull();
    expect(panelScope.queryByText('Viewing past chat')).toBeNull();
    expect(panelScope.queryByText('Past-session reply that should disappear')).toBeNull();
    expect(panelScope.getByRole('button', { name: 'History' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'New chat' })).toBeVisible();
  });

  it('keeps history and chat actions wired when creating a new chat from an already empty current chat', async () => {
    useSessionStore.getState().setActiveChatId('chat-empty-current');
    window.bridge.getChat = vi.fn(async (chatId: string) => {
      if (chatId === 'chat-empty-current') {
        return {
          id: 'chat-empty-current',
          title: 'Initial empty chat',
          createdAt: '2026-03-12T08:00:00.000Z',
          updatedAt: '2026-03-12T08:00:00.000Z',
          isCurrent: true,
        };
      }

      if (chatId === 'chat-fresh-empty') {
        return {
          id: 'chat-fresh-empty',
          title: 'Fresh chat',
          createdAt: '2026-03-12T10:00:00.000Z',
          updatedAt: '2026-03-12T10:00:00.000Z',
          isCurrent: true,
        };
      }

      return null;
    });
    window.bridge.createChat = vi.fn(async () => ({
      id: 'chat-fresh-empty',
      title: 'Fresh chat',
      createdAt: '2026-03-12T10:00:00.000Z',
      updatedAt: '2026-03-12T10:00:00.000Z',
      isCurrent: true,
    }));
    window.bridge.listChats = vi.fn(async () => [
      {
        id: 'chat-fresh-empty',
        title: 'Fresh chat',
        createdAt: '2026-03-12T10:00:00.000Z',
        updatedAt: '2026-03-12T10:00:00.000Z',
        isCurrent: true,
      },
      {
        id: 'chat-empty-current',
        title: 'Initial empty chat',
        createdAt: '2026-03-12T08:00:00.000Z',
        updatedAt: '2026-03-12T08:00:00.000Z',
        isCurrent: false,
      },
    ]);
    window.bridge.listChatMessages = vi.fn(async () => []);
    window.bridge.listLiveSessions = vi.fn(async () => []);

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(panelScope.getByRole('button', { name: 'History' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'New chat' })).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'New chat' }));
    });

    await waitFor(() => {
      expect(window.bridge.createChat).toHaveBeenCalledTimes(1);
      expect(useSessionStore.getState().activeChatId).toBe('chat-fresh-empty');
    });

    expect(panelScope.getByRole('button', { name: 'History' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'New chat' })).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'History' }));
    });

    expect(await panelScope.findByRole('button', { name: 'Back to chat' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'Back to chat' })).toBeVisible();
    const freshChatRow = panelScope.getByText('Fresh chat').closest('button');
    expect(freshChatRow).not.toBeNull();
    expect(within(freshChatRow as HTMLButtonElement).getByText('No saved turns yet.')).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Back to chat' }));
    });

    expect(useSessionStore.getState().activeChatId).toBe('chat-fresh-empty');
    expect(useUiStore.getState().panelView).toBe('chat');
    expect(panelScope.getByRole('button', { name: 'History' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'New chat' })).toBeVisible();
  });

  it('opens separate in-chat microphone and screen-share dropdowns and applies selections through the existing source paths', async () => {
    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'turn-source-1',
        role: 'assistant',
        content: 'Resume the session from here.',
        timestamp: '10:00',
        state: 'complete',
      },
    ]);
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        backendUrl: 'https://persisted.livepair.dev',
        selectedInputDeviceId: 'usb-mic',
      },
      isReady: true,
    });
    enumerateDevices.mockResolvedValue([
      createDevice({
        deviceId: 'default',
        kind: 'audioinput',
        label: 'Default microphone',
      }),
      createDevice({
        deviceId: 'usb-mic',
        kind: 'audioinput',
        label: 'USB Microphone',
      }),
      createDevice({
        deviceId: 'headset-mic',
        kind: 'audioinput',
        label: 'Headset Mic',
      }),
    ]);
    window.bridge.listScreenCaptureSources = vi.fn(async () => ({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen' },
        { id: 'window:42:0', name: 'VSCode' },
      ],
      selectedSourceId: 'window:42:0',
    }));
    window.bridge.selectScreenCaptureSource = vi.fn(async (sourceId) => ({
      sources: [
        { id: 'screen:1:0', name: 'Entire Screen' },
        { id: 'window:42:0', name: 'VSCode' },
      ],
      selectedSourceId: sourceId,
    }));

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);
    await waitFor(() => {
      expect(window.bridge.listScreenCaptureSources).toHaveBeenCalledTimes(1);
    });

    expect(panelScope.getByRole('button', { name: 'Resume Live Session' })).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Microphone options' }));
    });

    const microphoneDropdown = await screen.findByRole('listbox', {
      name: 'Microphone input options',
    });
    const microphoneDropdownScope = within(microphoneDropdown);
    expect(
      microphoneDropdownScope.getByRole('option', { name: 'USB Microphone' }),
    ).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await act(async () => {
      fireEvent.click(microphoneDropdownScope.getByRole('option', { name: 'Headset Mic' }));
    });

    await waitFor(() => {
      expect(window.bridge.updateSettings).toHaveBeenCalledWith({
        selectedInputDeviceId: 'headset-mic',
      });
      expect(screen.queryByRole('listbox', { name: 'Microphone input options' })).toBeNull();
    });

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Microphone options' }));
    });

    const reopenedAfterMicChange = await screen.findByRole('listbox', {
      name: 'Microphone input options',
    });
    const reopenedAfterMicChangeScope = within(reopenedAfterMicChange);
    expect(
      reopenedAfterMicChangeScope.getByRole('option', { name: 'Headset Mic' }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(
      reopenedAfterMicChangeScope.getByRole('option', { name: 'USB Microphone' }),
    ).toHaveAttribute('aria-selected', 'false');

    await act(async () => {
      fireEvent.mouseDown(document.body);
    });

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'Microphone input options' })).toBeNull();
    });

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Screen share options' }));
    });

    const screenDropdown = await screen.findByRole('listbox', {
      name: 'Screen source options',
    });
    const screenDropdownScope = within(screenDropdown);
    expect(
      screenDropdownScope.getByRole('option', { name: 'VSCode' }),
    ).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      fireEvent.click(screenDropdownScope.getByRole('option', { name: 'Entire Screen' }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(window.bridge.selectScreenCaptureSource).toHaveBeenCalledWith('screen:1:0');
      expect(useSettingsStore.getState().settings.selectedInputDeviceId).toBe('headset-mic');
      expect(useSessionStore.getState().selectedScreenCaptureSourceId).toBe('screen:1:0');
      expect(screen.queryByRole('listbox', { name: 'Screen source options' })).toBeNull();
    });

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Screen share options' }));
    });

    const reopenedAfterScreenChange = await screen.findByRole('listbox', {
      name: 'Screen source options',
    });
    const reopenedAfterScreenChangeScope = within(reopenedAfterScreenChange);
    expect(
      reopenedAfterScreenChangeScope.getByRole('option', { name: 'Entire Screen' }),
    ).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      fireEvent.mouseDown(document.body);
    });

    await waitFor(() => {
      expect(screen.queryByRole('listbox', { name: 'Screen source options' })).toBeNull();
    });

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Disable microphone' }));
    });

    expect(await panelScope.findByRole('button', { name: 'Enable microphone' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'Resume Live Session' })).toBeVisible();
  });

  it('returns from history without corrupting an opened past chat state', async () => {
    useSessionStore.getState().setActiveChatId('chat-history-opened');
    useSessionStore.getState().replaceConversationTurns([
      {
        id: 'turn-history-1',
        role: 'assistant',
        content: 'Past discussion still open',
        timestamp: '09:00',
        state: 'complete',
      },
    ]);
    window.bridge.getChat = vi.fn(async (chatId: string) => {
      if (chatId === 'chat-history-opened') {
        return {
          id: 'chat-history-opened',
          title: 'Incident follow-up',
          createdAt: '2026-03-12T08:00:00.000Z',
          updatedAt: '2026-03-12T08:30:00.000Z',
          isCurrent: false,
        };
      }

      return null;
    });
    window.bridge.listChats = vi.fn(async () => [
      {
        id: 'chat-current',
        title: 'Current chat',
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:15:00.000Z',
        isCurrent: true,
      },
      {
        id: 'chat-history-opened',
        title: 'Incident follow-up',
        createdAt: '2026-03-12T08:00:00.000Z',
        updatedAt: '2026-03-12T08:30:00.000Z',
        isCurrent: false,
      },
    ]);
    window.bridge.listChatMessages = vi.fn(async (chatId: string) =>
      chatId === 'chat-current'
        ? []
        : [
            {
              id: 'message-history-opened-1',
              chatId,
              role: 'assistant' as const,
              contentText: 'Past discussion still open',
              createdAt: '2026-03-12T08:05:00.000Z',
              sequence: 1,
            },
          ],
    );
    window.bridge.listLiveSessions = vi.fn(async (chatId: string) =>
      chatId === 'chat-history-opened'
        ? [
            {
              id: 'live-session-history-opened',
              chatId,
              startedAt: '2026-03-12T08:05:00.000Z',
              endedAt: '2026-03-12T08:15:00.000Z',
              status: 'ended' as const,
              endedReason: null,
              resumptionHandle: null,
              lastResumptionUpdateAt: '2026-03-12T08:15:00.000Z',
              restorable: false,
              invalidatedAt: '2026-03-12T08:15:00.000Z',
              invalidationReason: null,
            },
          ]
        : [],
    );

    await renderAssistantPanel();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));
    });

    const panel = screen.getByRole('complementary', { name: 'Assistant Panel' });
    const panelScope = within(panel);

    expect(await panelScope.findByText('Incident follow-up')).toBeVisible();
    expect(panelScope.getByText('Past discussion still open')).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'History' }));
    });

    expect(await panelScope.findByRole('button', { name: 'Back to chat' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'Back to chat' })).toBeVisible();

    await act(async () => {
      fireEvent.click(panelScope.getByRole('button', { name: 'Back to chat' }));
    });

    expect(useSessionStore.getState().activeChatId).toBe('chat-history-opened');
    expect(useUiStore.getState().panelView).toBe('chat');
    expect(await panelScope.findByText('Incident follow-up')).toBeVisible();
    expect(panelScope.getByText('Past discussion still open')).toBeVisible();
    expect(panelScope.getByText('Latest Live session')).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'History' })).toBeVisible();
    expect(panelScope.getByRole('button', { name: 'New chat' })).toBeVisible();
  });
});
