import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelStatusSection } from './AssistantPanelStatusSection';

describe('AssistantPanelStatusSection', () => {
  it('renders status items, dev controls and retries backend when failed', () => {
    const onRetryBackendHealth = vi.fn(async () => {
      return undefined;
    });
    const onSetAssistantState = vi.fn();

    render(
      <AssistantPanelStatusSection
        assistantState="ready"
        isPanelOpen={true}
        backendState="failed"
        backendIndicatorState="disconnected"
        backendLabel="Not connected"
        showStateDevControls={true}
        onRetryBackendHealth={onRetryBackendHealth}
        onSetAssistantState={onSetAssistantState}
      />,
    );

    expect(screen.getByText('Assistant')).toBeVisible();
    expect(screen.getByText('Panel')).toBeVisible();
    expect(screen.getByText('Backend')).toBeVisible();
    expect(screen.getByText('Open')).toBeVisible();
    expect(screen.getByText('Not connected')).toBeVisible();
    expect(screen.getByText('Set state:')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryBackendHealth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'speaking' }));
    expect(onSetAssistantState).toHaveBeenCalledWith('speaking');
  });

  it('hides dev controls and retry when backend is not failed', () => {
    const onRetryBackendHealth = vi.fn(async () => {
      return undefined;
    });
    const onSetAssistantState = vi.fn();

    render(
      <AssistantPanelStatusSection
        assistantState="disconnected"
        isPanelOpen={false}
        backendState="connected"
        backendIndicatorState="ready"
        backendLabel="Connected"
        showStateDevControls={false}
        onRetryBackendHealth={onRetryBackendHealth}
        onSetAssistantState={onSetAssistantState}
      />,
    );

    expect(screen.getByText('Closed')).toBeVisible();
    expect(screen.getByText('Connected')).toBeVisible();
    expect(screen.queryByText('Set state:')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });
});
