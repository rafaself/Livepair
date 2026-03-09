import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelHeader } from './AssistantPanelHeader';

describe('AssistantPanelHeader', () => {
  it('renders view toggles and routes clicks to the requested panel view', () => {
    const setPanelView = vi.fn();

    render(
      <AssistantPanelHeader
        panelView="settings"
        setPanelView={setPanelView}
        showStateDevControls={true}
      />,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Chat' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'Developer tools' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Chat' }));
    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));

    expect(setPanelView).toHaveBeenNthCalledWith(1, 'chat');
    expect(setPanelView).toHaveBeenNthCalledWith(2, 'debug');
  });

  it('omits developer controls when they are disabled', () => {
    render(
      <AssistantPanelHeader
        panelView="chat"
        setPanelView={vi.fn()}
        showStateDevControls={false}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Developer tools' })).toBeNull();
  });
});
