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
  it('renders standardized icon actions in chat mode and wires them', () => {
    const onOpenHistory = vi.fn();
    const onCreateChat = vi.fn(async () => {});

    renderSharedHeaderActions({
      panelView: 'chat',
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

  it('renders only the standardized back action in history mode', () => {
    const onBackToChat = vi.fn();

    renderSharedHeaderActions({
      panelView: 'history',
      onOpenHistory: vi.fn(),
      onCreateChat: vi.fn(async () => {}),
      onBackToChat,
    });

    const backButton = screen.getByRole('button', { name: 'Back to chat' });

    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(backButton).toHaveClass(
      'icon-btn',
      'icon-btn--sm',
      'assistant-panel__inner-header-action',
    );
    expect(backButton.querySelector('svg.lucide-arrow-left')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'History' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'New chat' })).toBeNull();
    expect(document.querySelector('.assistant-panel__inner-header-action-spacer')).not.toBeNull();

    fireEvent.click(backButton);

    expect(onBackToChat).toHaveBeenCalledOnce();
  });

  it('keeps the shared header content containers stable while swapping actions', () => {
    const { container, rerender } = renderSharedHeaderActions({
      panelView: 'chat',
      onOpenHistory: vi.fn(),
      onCreateChat: vi.fn(async () => {}),
      onBackToChat: vi.fn(),
    });

    const content = container.querySelector('.assistant-panel__inner-header-content');
    const actions = container.querySelector('.assistant-panel__inner-header-actions');

    expect(content).not.toBeNull();
    expect(actions).not.toBeNull();
    expect(within(content as HTMLDivElement).getByRole('button', { name: 'History' })).toBeVisible();
    expect(within(content as HTMLDivElement).getByRole('button', { name: 'New chat' })).toBeVisible();

    rerender(
      <div className="assistant-panel__inner-header">
        <AssistantPanelSharedHeaderActions
          panelView="history"
          onOpenHistory={vi.fn()}
          onCreateChat={vi.fn(async () => {})}
          onBackToChat={vi.fn()}
        />
      </div>,
    );

    expect(container.querySelector('.assistant-panel__inner-header-content')).toBe(content);
    expect(container.querySelector('.assistant-panel__inner-header-actions')).toBe(actions);
    expect(within(content as HTMLDivElement).getByRole('button', { name: 'Back to chat' })).toBeVisible();
    expect(within(content as HTMLDivElement).queryByRole('button', { name: 'History' })).toBeNull();
    expect(within(content as HTMLDivElement).queryByRole('button', { name: 'New chat' })).toBeNull();
  });
});
