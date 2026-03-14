import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelHeader } from './AssistantPanelHeader';

describe('AssistantPanelHeader', () => {
  it('shows chat to the right of settings and keeps history out of the global header when debug mode is enabled', () => {
    const setPanelView = vi.fn();

    render(
      <AssistantPanelHeader
        panelView="settings"
        setPanelView={setPanelView}
        isDebugMode={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Developer tools' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Chat history' })).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Developer tools',
      'Settings',
      'Chat',
      'Quit application',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));

    expect(setPanelView).toHaveBeenNthCalledWith(1, 'settings');
    expect(setPanelView).toHaveBeenNthCalledWith(2, 'chat');
    expect(setPanelView).toHaveBeenNthCalledWith(3, 'debug');
  });

  it('shows settings and chat in the header when debug mode is disabled', () => {
    render(
      <AssistantPanelHeader
        panelView="settings"
        setPanelView={vi.fn()}
        isDebugMode={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Developer tools' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByRole('button', { name: 'Chat history' })).toBeNull();
    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Settings',
      'Chat',
      'Quit application',
    ]);
  });

  it('marks chat as active when the chat view is selected', () => {
    render(
      <AssistantPanelHeader
        panelView="chat"
        setPanelView={vi.fn()}
        isDebugMode={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'false');
  });
});
