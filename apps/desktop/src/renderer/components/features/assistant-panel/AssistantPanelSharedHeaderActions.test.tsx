import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelSharedHeaderActions } from './AssistantPanelSharedHeaderActions';

type RenderSharedHeaderActionsProps = ComponentProps<typeof AssistantPanelSharedHeaderActions>;

function renderSharedHeaderActions(
  props: RenderSharedHeaderActionsProps,
): ReturnType<typeof render> {
  return render(
    <div className="assistant-panel__inner-header">
      <AssistantPanelSharedHeaderActions {...props} />
    </div>,
  );
}

describe('AssistantPanelSharedHeaderActions', () => {
  it('renders history and new chat actions in chat mode when a session already exists', () => {
    const onOpenHistory = vi.fn();
    const onCreateChat = vi.fn(async () => {});

    renderSharedHeaderActions({
      panelView: 'chat',
      showHistory: true,
      showCreateChat: true,
      showBackToChat: false,
      onOpenHistory,
      onCreateChat,
      onBackToChat: vi.fn(),
    });

    const historyButton = screen.getByRole('button', { name: 'History' });
    const newChatButton = screen.getByRole('button', { name: 'New chat' });

    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(historyButton).toHaveClass(
      'icon-btn',
      'icon-btn--sm',
      'assistant-panel__inner-header-action',
    );
    expect(newChatButton).toHaveClass(
      'icon-btn',
      'icon-btn--sm',
      'assistant-panel__inner-header-action',
    );
    expect(historyButton.querySelector('svg.lucide-history')).not.toBeNull();
    expect(newChatButton.querySelector('svg.lucide-message-circle-plus')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to chat' })).toBeNull();

    fireEvent.click(historyButton);
    fireEvent.click(newChatButton);

    expect(onOpenHistory).toHaveBeenCalledOnce();
    expect(onCreateChat).toHaveBeenCalledOnce();
  });

  it('renders only the history action in chat mode for a clean conversation', () => {
    const onOpenHistory = vi.fn();

    renderSharedHeaderActions({
      panelView: 'chat',
      showHistory: true,
      showCreateChat: false,
      showBackToChat: false,
      onOpenHistory,
      onCreateChat: vi.fn(async () => {}),
      onBackToChat: vi.fn(),
    });

    const historyButton = screen.getByRole('button', { name: 'History' });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(historyButton).toHaveClass(
      'icon-btn',
      'icon-btn--sm',
      'assistant-panel__inner-header-action',
    );
    expect(historyButton.querySelector('svg.lucide-history')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Back to chat' })).toBeNull();
    fireEvent.click(historyButton);

    expect(onOpenHistory).toHaveBeenCalledOnce();
  });

  it('renders new chat and back to chat actions in history mode with back on the right', () => {
    const onCreateChat = vi.fn(async () => {});
    const onBackToChat = vi.fn();

    renderSharedHeaderActions({
      panelView: 'history',
      showHistory: false,
      showCreateChat: true,
      showBackToChat: true,
      onOpenHistory: vi.fn(),
      onCreateChat,
      onBackToChat,
    });

    const buttons = screen.getAllByRole('button');
    const newChatButton = screen.getByRole('button', { name: 'New chat' });
    const backButton = screen.getByRole('button', { name: 'Back to chat' });

    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'New chat',
      'Back to chat',
    ]);
    expect(newChatButton).toHaveAccessibleName('New chat');
    expect(backButton).toHaveAccessibleName('Back to chat');
    expect(newChatButton.querySelector('svg.lucide-message-circle-plus')).not.toBeNull();
    expect(backButton.querySelector('svg.lucide-arrow-right')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();

    fireEvent.click(newChatButton);
    fireEvent.click(backButton);

    expect(onCreateChat).toHaveBeenCalledOnce();
    expect(onBackToChat).toHaveBeenCalledOnce();
  });

  it('renders only the back action in history mode for a new or empty chat', () => {
    const onBackToChat = vi.fn();

    renderSharedHeaderActions({
      panelView: 'history',
      showHistory: false,
      showCreateChat: false,
      showBackToChat: true,
      onOpenHistory: vi.fn(),
      onCreateChat: vi.fn(async () => {}),
      onBackToChat,
    });

    const backButton = screen.getByRole('button', { name: 'Back to chat' });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(backButton.querySelector('svg.lucide-arrow-right')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();

    fireEvent.click(backButton);

    expect(onBackToChat).toHaveBeenCalledOnce();
  });

  it('keeps the shared header content containers stable while swapping action buttons', () => {
    const { container, rerender } = renderSharedHeaderActions({
      panelView: 'chat',
      showHistory: true,
      showCreateChat: false,
      showBackToChat: false,
      onOpenHistory: vi.fn(),
      onCreateChat: vi.fn(async () => {}),
      onBackToChat: vi.fn(),
    });

    const content = container.querySelector('.assistant-panel__inner-header-content');
    const actions = container.querySelector('.assistant-panel__inner-header-actions');

    expect(content).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(within(content as HTMLDivElement).getByRole('button', { name: 'History' })).toBeVisible();
    expect(within(content as HTMLDivElement).queryByRole('button', { name: 'New chat' })).toBeNull();

    rerender(
      <div className="assistant-panel__inner-header">
        <AssistantPanelSharedHeaderActions
          panelView="history"
          showHistory={false}
          showCreateChat
          showBackToChat
          onOpenHistory={vi.fn()}
          onCreateChat={vi.fn(async () => {})}
          onBackToChat={vi.fn()}
        />
      </div>,
    );

    expect(container.querySelector('.assistant-panel__inner-header-content')).toBe(content);
    expect(container.querySelector('.assistant-panel__inner-header-actions')).toBe(actions);
    expect(within(content as HTMLDivElement).getByRole('button', { name: 'Back to chat' })).toBeVisible();
    expect(within(content as HTMLDivElement).getByRole('button', { name: 'New chat' })).toBeVisible();
    expect(within(content as HTMLDivElement).queryByRole('button', { name: 'History' })).toBeNull();
  });
});
