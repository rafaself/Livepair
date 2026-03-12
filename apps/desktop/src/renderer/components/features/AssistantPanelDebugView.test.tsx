import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';

describe('AssistantPanelDebugView', () => {
  it('renders developer diagnostics without assistant state controls', () => {
    const onRetryBackendHealth = vi.fn(async () => undefined);

    render(
      <AssistantPanelDebugView
        backendState="failed"
        backendIndicatorState="error"
        backendLabel="Not connected"
        tokenFeedback="Connection failed"
        voiceSessionStatus="streaming"
        voiceSessionResumption={{
          status: 'reconnecting',
          latestHandle: 'handles/voice-session-2',
          resumable: true,
          lastDetail: 'server draining',
        }}
        voiceSessionDurability={{
          compressionEnabled: true,
          tokenValid: false,
          tokenRefreshing: true,
          tokenRefreshFailed: false,
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
          lastDetail: 'Refreshing token before resume',
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
        voiceToolState={{
          status: 'toolResponding',
          toolName: 'get_current_mode',
          callId: 'call-1',
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
      />,
    );

    expect(screen.getByRole('heading', { name: 'Developer tools' })).toBeVisible();
    expect(screen.getByText('Backend status')).toBeVisible();
    expect(screen.getByText('Token request')).toBeVisible();
    expect(screen.getByText('Mode')).toBeVisible();
    expect(screen.getByText('Fast')).toBeVisible();
    expect(screen.getByText('Voice session')).toBeVisible();
    expect(screen.getAllByText('Streaming').length).toBeGreaterThan(0);
    expect(screen.getByText('Session resumption')).toBeVisible();
    expect(screen.getByText('Reconnecting')).toBeVisible();
    expect(screen.getByText('Compression')).toBeVisible();
    expect(screen.getByText('Enabled')).toBeVisible();
    expect(screen.getByText('Token valid')).toBeVisible();
    expect(screen.getByText('Token refreshing')).toBeVisible();
    expect(screen.getByText('Tool state')).toBeVisible();
    expect(screen.getByText('Tool responding')).toBeVisible();
    expect(screen.getByText('Current tool')).toBeVisible();
    expect(screen.getByText('get_current_mode')).toBeVisible();
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
    expect(screen.queryByText('Assistant state')).toBeNull();
    expect(screen.queryByText('Preview')).toBeNull();
    expect(screen.queryByText('Set assistant state')).toBeNull();
    expect(screen.queryByRole('button', { name: 'speaking' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry backend' }));
    expect(onRetryBackendHealth).toHaveBeenCalledTimes(1);
  });
});
