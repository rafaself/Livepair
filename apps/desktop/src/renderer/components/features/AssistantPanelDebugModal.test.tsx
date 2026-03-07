import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelDebugModal } from './AssistantPanelDebugModal';

describe('AssistantPanelDebugModal', () => {
  it('renders developer diagnostics and state controls when open', () => {
    const onClose = vi.fn();
    const onRetryBackendHealth = vi.fn(async () => undefined);
    const onSetAssistantState = vi.fn();

    render(
      <AssistantPanelDebugModal
        isOpen={true}
        assistantState="ready"
        backendState="failed"
        backendIndicatorState="error"
        backendLabel="Not connected"
        tokenFeedback="Connection failed"
        onClose={onClose}
        onRetryBackendHealth={onRetryBackendHealth}
        onSetAssistantState={onSetAssistantState}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Developer tools' })).toBeVisible();
    expect(screen.getByText('Backend status')).toBeVisible();
    expect(screen.getByText('Token request')).toBeVisible();
    expect(screen.getByText('Mode')).toBeVisible();
    expect(screen.getByText('Fast')).toBeVisible();
    expect(screen.getByText('Set assistant state')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry backend' }));
    expect(onRetryBackendHealth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'speaking' }));
    expect(onSetAssistantState).toHaveBeenCalledWith('speaking');

    fireEvent.click(screen.getByRole('button', { name: 'Close developer tools' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the dialog hidden when closed', () => {
    render(
      <AssistantPanelDebugModal
        isOpen={false}
        assistantState="disconnected"
        backendState="idle"
        backendIndicatorState="disconnected"
        backendLabel="Not connected"
        tokenFeedback={null}
        onClose={() => undefined}
        onRetryBackendHealth={async () => undefined}
        onSetAssistantState={() => undefined}
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Developer tools' })).toBeNull();
  });
});
