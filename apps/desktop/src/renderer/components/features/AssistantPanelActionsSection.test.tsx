import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelActionsSection } from './AssistantPanelActionsSection';

describe('AssistantPanelActionsSection', () => {
  it('calls connect and start listening callbacks and shows feedback', () => {
    const onConnect = vi.fn(async () => {
      return undefined;
    });
    const onStartListening = vi.fn();

    render(
      <AssistantPanelActionsSection
        tokenRequestState="idle"
        tokenFeedback="Token received"
        onConnect={onConnect}
        onStartListening={onStartListening}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start Listening' }));

    expect(onConnect).toHaveBeenCalledTimes(1);
    expect(onStartListening).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Token received')).toBeVisible();
  });

  it('disables connect button while loading', () => {
    const onConnect = vi.fn(async () => {
      return undefined;
    });
    const onStartListening = vi.fn();

    render(
      <AssistantPanelActionsSection
        tokenRequestState="loading"
        tokenFeedback="Requesting token..."
        onConnect={onConnect}
        onStartListening={onStartListening}
      />,
    );

    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
  });
});
