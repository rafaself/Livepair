import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelHeader } from './AssistantPanelHeader';

describe('AssistantPanelHeader', () => {
  it('keeps chat and history controls out of the global header when debug mode is enabled', () => {
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
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat history' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Developer tools' }));

    expect(setPanelView).toHaveBeenNthCalledWith(1, 'settings');
    expect(setPanelView).toHaveBeenNthCalledWith(2, 'debug');
  });

  it('keeps only Settings in the header when debug mode is disabled', () => {
    render(
      <AssistantPanelHeader
        panelView="settings"
        setPanelView={vi.fn()}
        isDebugMode={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Developer tools' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Chat history' })).toBeNull();
  });
});
