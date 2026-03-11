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
        voiceSessionStatus="streaming"
        voiceSessionResumption={{
          status: 'resumed',
          latestHandle: 'handles/voice-session-2',
          resumable: true,
          lastDetail: 'server draining',
        }}
        voiceCaptureState="capturing"
        voiceCaptureDiagnostics={{
          chunkCount: 3,
          sampleRateHz: 16_000,
          bytesPerChunk: 640,
          chunkDurationMs: 20,
          selectedInputDeviceId: 'default',
          lastError: null,
        }}
        voicePlaybackState="playing"
        voicePlaybackDiagnostics={{
          chunkCount: 2,
          queueDepth: 1,
          sampleRateHz: 24_000,
          selectedOutputDeviceId: 'desk-speakers',
          lastError: null,
        }}
        screenCaptureState="streaming"
        screenCaptureDiagnostics={{
          captureSource: 'Entire screen',
          frameCount: 4,
          frameRateHz: 1,
          widthPx: 640,
          heightPx: 360,
          lastFrameAt: '2026-03-10T10:15:00.000Z',
          lastUploadStatus: 'sent',
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
    expect(screen.getByText('Voice session')).toBeVisible();
    expect(screen.getAllByText('Streaming')).toHaveLength(2);
    expect(screen.getByText('Session resumption')).toBeVisible();
    expect(screen.getByText('Resumed')).toBeVisible();
    expect(screen.getByText('Handle available')).toBeVisible();
    expect(screen.getByText('Yes')).toBeVisible();
    expect(screen.getByText('Voice capture')).toBeVisible();
    expect(screen.getByText('Capturing')).toBeVisible();
    expect(screen.getByText('Voice playback')).toBeVisible();
    expect(screen.getByText('Playing')).toBeVisible();
    expect(screen.getByText('Screen context')).toBeVisible();
    expect(screen.getByText('Sent')).toBeVisible();
    expect(screen.getByText('Entire screen')).toBeVisible();
    expect(screen.getByText('Chunk count')).toBeVisible();
    expect(screen.getByText('3')).toBeVisible();
    expect(screen.getByText('Audio format')).toBeVisible();
    expect(screen.getByText('16 kHz / mono / pcm_s16le')).toBeVisible();
    expect(screen.getByText('Playback output')).toBeVisible();
    expect(screen.getByText('desk-speakers')).toBeVisible();
    expect(screen.getByText('Set assistant state')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'Retry backend' }));
    expect(onRetryBackendHealth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'speaking' }));
    expect(onSetAssistantState).toHaveBeenCalledWith('speaking');
  });
});
