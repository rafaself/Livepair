import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';

describe('AssistantPanelDebugView', () => {
  it('renders developer diagnostics and state controls', () => {
    const onRetryBackendHealth = vi.fn(async () => undefined);
    const onSetAssistantState = vi.fn();

    render(
      <AssistantPanelDebugView
        assistantState="ready"
        backendState="failed"
        backendIndicatorState="error"
        backendLabel="Not connected"
        tokenFeedback="Connection failed"
        voiceCaptureState="capturing"
        voiceCaptureDiagnostics={{
          chunkCount: 3,
          sampleRateHz: 16_000,
          bytesPerChunk: 640,
          chunkDurationMs: 20,
          selectedInputDeviceId: 'default',
          lastError: null,
        }}
        onRetryBackendHealth={onRetryBackendHealth}
        onSetAssistantState={onSetAssistantState}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Developer tools' })).toBeVisible();
    expect(screen.getByText('Backend status')).toBeVisible();
    expect(screen.getByText('Token request')).toBeVisible();
    expect(screen.getByText('Mode')).toBeVisible();
    expect(screen.getByText('Fast')).toBeVisible();
    expect(screen.getByText('Voice capture')).toBeVisible();
    expect(screen.getByText('Capturing')).toBeVisible();
    expect(screen.getByText('Chunk count')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('Audio format')).toBeVisible();
    expect(screen.getByText('16 kHz / mono / pcm_s16le')).toBeVisible();
    expect(screen.getByText('Set assistant state')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry backend' }));
    expect(onRetryBackendHealth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'speaking' }));
    expect(onSetAssistantState).toHaveBeenCalledWith('speaking');
  });
});
