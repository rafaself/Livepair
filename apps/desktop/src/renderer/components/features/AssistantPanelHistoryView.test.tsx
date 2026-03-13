import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelHistoryView } from './AssistantPanelHistoryView';

describe('AssistantPanelHistoryView', () => {
  it('supports safely refreshing the history list when it becomes stale', async () => {
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

    render(<AssistantPanelHistoryView activeChatId="chat-1" onSelectChat={() => {}} />);

    expect(await screen.findByText('Older chat')).toBeVisible();
    expect(screen.queryByText('Fresh chat')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));

    await waitFor(() => {
      expect(screen.getByText('Fresh chat')).toBeVisible();
    });
    expect(listChats).toHaveBeenCalledTimes(2);
  });
});
