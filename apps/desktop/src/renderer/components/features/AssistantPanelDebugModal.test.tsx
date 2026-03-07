import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';

describe('AssistantPanelDebugView', () => {
  it('renders developer diagnostics and state controls', () => {
    const onBack = vi.fn();
    const onRetryBackendHealth = vi.fn(async () => undefined);
    const onSetAssistantState = vi.fn();

    render(
      <AssistantPanelDebugView
        assistantState="ready"
        backendState="failed"
        backendIndicatorState="error"
        backendLabel="Not connected"
        tokenFeedback="Connection failed"
        onBack={onBack}
        onRetryBackendHealth={onRetryBackendHealth}
        onSetAssistantState={onSetAssistantState}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Developer tools' })).toBeVisible();
    expect(screen.getByText('Backend status')).toBeVisible();
    expect(screen.getByText('Token request')).toBeVisible();
    expect(screen.getByText('Mode')).toBeVisible();
    expect(screen.getByText('Fast')).toBeVisible();
    expect(screen.getByText('Set assistant state')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry backend' }));
    expect(onRetryBackendHealth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'speaking' }));
    expect(onSetAssistantState).toHaveBeenCalledWith('speaking');

    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
