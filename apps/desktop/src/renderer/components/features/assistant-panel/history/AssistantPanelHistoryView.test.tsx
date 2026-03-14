import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AssistantPanelHistoryHeader,
  AssistantPanelHistoryView,
  useAssistantPanelHistoryViewModel,
} from './AssistantPanelHistoryView';

type HistoryViewHarnessProps = {
  activeChatId: string | null;
  onBackToChat?: () => void;
  onSelectChat?: (chatId: string) => void;
};

function HistoryViewHarness({
  activeChatId,
  onBackToChat,
  onSelectChat = () => {},
}: HistoryViewHarnessProps): JSX.Element {
  const viewModel = useAssistantPanelHistoryViewModel({
    activeChatId,
    isEnabled: true,
  });

  return (
    <div className="assistant-panel__inner-shell">
      <div className="assistant-panel__inner-header">
        <AssistantPanelHistoryHeader
          onRefresh={viewModel.refreshChats}
          refreshLabel={viewModel.refreshLabel}
          refreshDisabled={viewModel.refreshDisabled}
          {...(onBackToChat ? { onBackToChat } : {})}
        />
      </div>
      <div className="assistant-panel__inner-body">
        <AssistantPanelHistoryView
          activeChatId={activeChatId}
          onSelectChat={onSelectChat}
          viewModel={viewModel}
        />
      </div>
    </div>
  );
}

describe('AssistantPanelHistoryView', () => {
  it('renders the history body inside the shared header harness with a Back to chat action', async () => {
    window.bridge.listChats = vi.fn(async () => []);

    render(<HistoryViewHarness activeChatId={null} onBackToChat={() => {}} />);

    expect(await screen.findByText('No past chats yet.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back to chat' })).toBeVisible();
  });

  it('supports safely refreshing the shared history body when it becomes stale', async () => {
    const listChats = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'chat-1',
          title: 'Older chat',
          createdAt: '2026-03-10T09:00:00.000Z',
          updatedAt: '2026-03-10T09:10:00.000Z',
          isCurrent: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'chat-2',
          title: 'Fresh chat',
          createdAt: '2026-03-12T09:00:00.000Z',
          updatedAt: '2026-03-12T09:10:00.000Z',
          isCurrent: true,
        },
        {
          id: 'chat-1',
          title: 'Older chat',
          createdAt: '2026-03-10T09:00:00.000Z',
          updatedAt: '2026-03-10T09:10:00.000Z',
          isCurrent: false,
        },
      ]);
    window.bridge.listChats = listChats;

    render(<HistoryViewHarness activeChatId="chat-1" />);

    expect(await screen.findByText('Older chat')).toBeVisible();
    expect(screen.queryByText('Fresh chat')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));

    await waitFor(() => {
      expect(screen.getByText('Fresh chat')).toBeVisible();
    });
    expect(listChats).toHaveBeenCalledTimes(2);
  });

  it('shows lightweight previews and current-chat versus latest-session cues in history rows', async () => {
    window.bridge.listChats = vi.fn(async () => [
      {
        id: 'chat-current',
        title: 'Design review',
        createdAt: '2026-03-12T09:00:00.000Z',
        updatedAt: '2026-03-12T09:30:00.000Z',
        isCurrent: true,
      },
      {
        id: 'chat-past',
        title: 'Incident follow-up',
        createdAt: '2026-03-11T09:00:00.000Z',
        updatedAt: '2026-03-11T09:30:00.000Z',
        isCurrent: false,
      },
    ]);
    window.bridge.listChatMessages = vi.fn(async (chatId: string) =>
      chatId === 'chat-current'
        ? [
            {
              id: 'message-1',
              chatId,
              role: 'assistant' as const,
              contentText: 'Latest saved reply from the current chat container.',
              createdAt: '2026-03-12T09:25:00.000Z',
              sequence: 1,
            },
          ]
        : [
            {
              id: 'message-2',
              chatId,
              role: 'user' as const,
              contentText: 'Past chat preview with enough detail to identify it quickly.',
              createdAt: '2026-03-11T09:15:00.000Z',
              sequence: 1,
            },
          ],
    );
    window.bridge.listLiveSessions = vi.fn(async (chatId: string) =>
      chatId === 'chat-current'
        ? [
            {
              id: 'live-session-current',
              chatId,
              startedAt: '2026-03-12T09:10:00.000Z',
              endedAt: null,
              status: 'active' as const,
              endedReason: null,
              resumptionHandle: 'handles/live-session-current',
              lastResumptionUpdateAt: '2026-03-12T09:20:00.000Z',
              restorable: true,
              invalidatedAt: null,
              invalidationReason: null,
            },
          ]
        : [
            {
              id: 'live-session-past',
              chatId,
              startedAt: '2026-03-11T09:10:00.000Z',
              endedAt: '2026-03-11T09:20:00.000Z',
              status: 'ended' as const,
              endedReason: null,
              resumptionHandle: null,
              lastResumptionUpdateAt: '2026-03-11T09:20:00.000Z',
              restorable: false,
              invalidatedAt: '2026-03-11T09:20:00.000Z',
              invalidationReason: null,
            },
          ],
    );

    render(<HistoryViewHarness activeChatId="chat-past" />);

    const currentTitle = await screen.findByText('Design review');
    const currentButton = currentTitle.closest('button');
    expect(currentButton).not.toBeNull();
    expect(within(currentButton as HTMLButtonElement).getByText('Current chat')).toBeVisible();
    expect(
      within(currentButton as HTMLButtonElement).getByText('Latest saved reply from the current chat container.'),
    ).toBeVisible();
    expect(within(currentButton as HTMLButtonElement).getByText('Latest session active')).toBeVisible();
    expect(within(currentButton as HTMLButtonElement).getByText('Resume may be available')).toBeVisible();

    const pastTitle = screen.getByText('Incident follow-up');
    const pastButton = pastTitle.closest('button');
    expect(pastButton).not.toBeNull();
    expect(within(pastButton as HTMLButtonElement).getByText('Opened now')).toBeVisible();
    expect(
      within(pastButton as HTMLButtonElement).getByText('Past chat preview with enough detail to identify it quickly.'),
    ).toBeVisible();
    expect(within(pastButton as HTMLButtonElement).getByText('Latest session ended')).toBeVisible();
  });
});
