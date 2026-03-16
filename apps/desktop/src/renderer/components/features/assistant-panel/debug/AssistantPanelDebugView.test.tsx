import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';
import { useSessionStore } from '../../../../store/sessionStore';
import { resetDesktopStores } from '../../../../test/store';

beforeEach(() => {
  resetDesktopStores();
});

describe('AssistantPanelDebugView', () => {
  it('renders the deterministic continuous and burst screen diagnostics', () => {
    useSessionStore.setState({
      screenCaptureState: 'capturing',
      screenCaptureDiagnostics: {
        captureSource: 'Entire screen',
        frameCount: 4,
        frameRateHz: 1,
        widthPx: 640,
        heightPx: 360,
        lastFrameAt: '2026-03-10T10:15:00.000Z',
        overlayMaskActive: false,
        maskedRectCount: 0,
        lastMaskedFrameAt: null,
        maskReason: 'hidden',
        lastUploadStatus: 'sent',
        lastError: null,
      },
      visualSendDiagnostics: {
        lastEvent: 'continuousBurstFrameSent',
        continuousCadenceMs: 3000,
        burstCadenceMs: 1000,
        continuousActive: true,
        continuousStartedAt: '2026-03-10T10:14:00.000Z',
        continuousStoppedAt: null,
        burstActive: true,
        burstUntil: '2026-03-10T10:15:04.000Z',
        meaningfulChangeCount: 5,
        burstActivationCount: 2,
        continuousFramesSentCount: 7,
        lastContinuousFrameAt: '2026-03-10T10:15:03.000Z',
        lastContinuousFrameReason: 'burst',
        manualSendPending: false,
        manualFramesSentCount: 2,
        lastManualFrameAt: '2026-03-10T10:13:00.000Z',
        blockedByGateway: 1,
      },
    } as never);

    render(
      <AssistantPanelDebugView
        saveScreenFramesEnabled={false}
        screenFrameDumpDirectoryPath="/tmp/livepair/screen-frame-dumps/current-debug-session"
        onToggleSaveScreenFrames={() => undefined}
        onRetryBackendHealth={async () => undefined}
      />,
    );

    expect(screen.getByText('Continuous cadence')).toBeVisible();
    expect(screen.getByText('3000 ms')).toBeVisible();
    expect(screen.getByText('Burst cadence')).toBeVisible();
    expect(screen.getByText('1000 ms')).toBeVisible();
    expect(screen.getByText('Last Share Screen event')).toBeVisible();
    expect(screen.getByText('Continuous burst frame sent')).toBeVisible();
    expect(screen.getByText('Burst active')).toBeVisible();
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
    expect(screen.getByText('Burst until')).toBeVisible();
    expect(screen.getByText('2026-03-10T10:15:04.000Z')).toBeVisible();
    expect(screen.getByText('Meaningful changes')).toBeVisible();
    expect(screen.getByText('5')).toBeVisible();
    expect(screen.getByText('Burst activations')).toBeVisible();
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    expect(screen.getByText('Continuous frames sent')).toBeVisible();
    expect(screen.getByText('Last continuous send')).toBeVisible();
    expect(screen.getByText('2026-03-10T10:15:03.000Z')).toBeVisible();
    expect(screen.getByText('Last continuous reason')).toBeVisible();
    expect(screen.getByText('burst')).toBeVisible();
    expect(screen.getByText('Blocked sends (gateway)')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
  });

  it('toggles save outbound frames from the debug view', () => {
    const onToggleSaveScreenFrames = vi.fn();

    render(
      <AssistantPanelDebugView
        saveScreenFramesEnabled={false}
        screenFrameDumpDirectoryPath={null}
        onToggleSaveScreenFrames={onToggleSaveScreenFrames}
        onRetryBackendHealth={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Save outbound frames' }));

    expect(onToggleSaveScreenFrames).toHaveBeenCalledTimes(1);
  });

  it('renders compact speech/chat diagnostics for capability, transcript, ignored-output, and recovery state', () => {
    useSessionStore.setState({
      activeVoiceSessionGroundingEnabled: true,
      effectiveVoiceSessionCapabilities: {
        responseModality: 'AUDIO',
        inputAudioTranscriptionEnabled: true,
        outputAudioTranscriptionEnabled: true,
        sessionResumptionEnabled: true,
      },
      voiceTranscriptDiagnostics: {
        inputTranscriptCount: 3,
        lastInputTranscriptAt: '2026-03-16T12:11:00.000Z',
        outputTranscriptCount: 0,
        lastOutputTranscriptAt: null,
        assistantTextFallbackCount: 2,
        lastAssistantTextFallbackAt: '2026-03-16T12:11:03.000Z',
        lastAssistantTextFallbackReason: 'missing-output-transcript',
      },
      ignoredAssistantOutputDiagnostics: {
        totalCount: 4,
        countsByEventType: {
          textDelta: 1,
          outputTranscript: 1,
          audioChunk: 2,
          turnComplete: 0,
        },
        countsByReason: {
          turnUnavailable: 2,
          lifecycleFence: 1,
          noOpenTurnFence: 1,
        },
        lastIgnoredAt: '2026-03-16T12:11:04.000Z',
        lastIgnoredReason: 'lifecycle-fence',
        lastIgnoredEventType: 'audio-chunk',
        lastIgnoredVoiceSessionStatus: 'recovering',
      },
      voiceSessionRecoveryDiagnostics: {
        transitionCount: 5,
        lastTransition: 'resume-connect-failed',
        lastTransitionAt: '2026-03-16T12:11:05.000Z',
        lastRecoveryDetail: 'resume rejected',
        lastTurnResetReason: 'new-user-transcript',
        lastTurnResetAt: '2026-03-16T12:11:06.000Z',
      },
    } as never);

    render(
      <AssistantPanelDebugView
        saveScreenFramesEnabled={false}
        screenFrameDumpDirectoryPath={null}
        onToggleSaveScreenFrames={() => undefined}
        onRetryBackendHealth={async () => undefined}
      />,
    );

    expect(screen.getByText('Speech/chat diagnostics')).toBeVisible();
    expect(screen.getByText('Response modality')).toBeVisible();
    expect(screen.getByText('AUDIO')).toBeVisible();
    expect(screen.getByText('Grounding')).toBeVisible();
    expect(screen.getByText('Input transcripts')).toBeVisible();
    expect(screen.getByText('3 (last: 2026-03-16T12:11:00.000Z)')).toBeVisible();
    expect(screen.getByText('Assistant text fallback')).toBeVisible();
    expect(screen.getByText('2 (last: 2026-03-16T12:11:03.000Z)')).toBeVisible();
    expect(screen.getByText('Ignored output by event')).toBeVisible();
    expect(screen.getByText('text 1 / transcript 1 / audio 2 / turn 0')).toBeVisible();
    expect(screen.getByText('Last ignored output')).toBeVisible();
    expect(screen.getByText('lifecycle fence / audio chunk / recovering')).toBeVisible();
    expect(screen.getByText('Last recovery transition')).toBeVisible();
    expect(screen.getByText('resume connect failed @ 2026-03-16T12:11:05.000Z')).toBeVisible();
    expect(screen.getByText('Last turn reopen/reset')).toBeVisible();
    expect(screen.getByText('new user transcript @ 2026-03-16T12:11:06.000Z')).toBeVisible();
  });
});
