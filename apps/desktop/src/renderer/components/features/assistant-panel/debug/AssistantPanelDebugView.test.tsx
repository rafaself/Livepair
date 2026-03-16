import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssistantPanelDebugView } from './AssistantPanelDebugView';
import { useSessionStore } from '../../../../store/sessionStore';
import { resetDesktopStores } from '../../../../test/store';

beforeEach(() => {
  resetDesktopStores();
});

describe('AssistantPanelDebugView', () => {
  it('renders the deterministic continuous screen diagnostics', () => {
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
        lastEvent: 'continuousFrameSent',
        continuousCadenceMs: 3000,
        continuousActive: true,
        continuousStartedAt: '2026-03-10T10:14:00.000Z',
        continuousStoppedAt: null,
        continuousFramesSentCount: 7,
        lastContinuousFrameAt: '2026-03-10T10:15:03.000Z',
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

    expect(screen.getByText('Automatic cadence')).toBeVisible();
    expect(screen.getByText('3000 ms')).toBeVisible();
    expect(screen.getByText('Last screen event')).toBeVisible();
    expect(screen.getByText('Continuous frame sent')).toBeVisible();
    expect(screen.getByText('Continuous active')).toBeVisible();
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
    expect(screen.getByText('Last continuous frame')).toBeVisible();
    expect(screen.getByText('2026-03-10T10:15:03.000Z')).toBeVisible();
    expect(screen.getByText('Sent (continuous)')).toBeVisible();
    expect(screen.getByText('7')).toBeVisible();
    expect(screen.getByText('Blocked (gateway)')).toBeVisible();
    expect(screen.getByText('1')).toBeVisible();
  });

  it('toggles save screen frames from the debug view', () => {
    const onToggleSaveScreenFrames = vi.fn();

    render(
      <AssistantPanelDebugView
        saveScreenFramesEnabled={false}
        screenFrameDumpDirectoryPath={null}
        onToggleSaveScreenFrames={onToggleSaveScreenFrames}
        onRetryBackendHealth={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole('switch', { name: 'Save screen frames' }));

    expect(onToggleSaveScreenFrames).toHaveBeenCalledTimes(1);
  });
});
