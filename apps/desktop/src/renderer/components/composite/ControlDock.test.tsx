import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { selectAssistantRuntimeState } from '../../runtime/selectors';
import { useSessionRuntime } from '../../runtime/useSessionRuntime';
import { __emitGeminiLiveSdkMessage } from '../../test/geminiLiveSdkMock';
import { AssistantPanelSettingsView } from '../features/AssistantPanelSettingsView';
import { ControlDock } from './ControlDock';

function renderDock() {
  function DockHarness(): JSX.Element {
    const assistantState = useSessionStore(selectAssistantRuntimeState);
    const isPanelOpen = useUiStore((state) => state.isPanelOpen);
    const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);
    const {
      handleEndSession,
      handleStartVoiceSession,
      handleStartVoiceCapture,
      handleStopVoiceCapture,
      isSessionActive,
      isVoiceSessionActive,
      voiceSessionStatus,
      voiceCaptureState,
    } = useSessionRuntime();

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <output aria-label="panel-pinned">{String(isPanelPinned)}</output>
        <output aria-label="assistant-state">{assistantState}</output>
        <output aria-label="voice-capture-state">{voiceCaptureState}</output>
        <ControlDock
          isTextSessionActive={isSessionActive}
          isVoiceSessionActive={isVoiceSessionActive}
          voiceSessionStatus={voiceSessionStatus}
          voiceCaptureState={voiceCaptureState}
          onStartVoiceSession={handleStartVoiceSession}
          onStartVoiceCapture={handleStartVoiceCapture}
          onStopVoiceCapture={handleStopVoiceCapture}
          onEndSession={handleEndSession}
        />
        <AssistantPanelSettingsView />
      </>
    );
  }

  return render(<DockHarness />);
}

describe('ControlDock', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    useUiStore.getState().initializeSettingsUi(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.requestSessionToken = vi.fn().mockResolvedValue({
      token: 'auth_tokens/test-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
  });

  it('renders voice session controls disconnected by default', () => {
    renderDock();

    expect(
      screen.getByRole('button', { name: /connect voice session to use microphone/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /camera unavailable in text mode/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /^connect voice session$/i }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /open panel/i })).toBeInTheDocument();
  });

  it('connects voice mode and then toggles local microphone capture from the dock', async () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /^connect voice session$/i }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /connecting voice session/i }),
      ).toBeDisabled();
    });
    await act(async () => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /start microphone capture/i }),
      ).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: /start microphone capture/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('voice-capture-state')).toHaveTextContent('capturing');
    });
    expect(
      screen.getByRole('button', { name: /stop microphone capture/i }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /stop microphone capture/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('voice-capture-state')).toHaveTextContent('stopped');
    });
  });

  it('keeps voice session controls unavailable while text mode is active', async () => {
    useSessionStore.getState().setTextSessionLifecycle({ status: 'ready' });
    renderDock();

    expect(
      screen.getByRole('button', { name: /voice session unavailable in text mode/i }),
    ).toBeDisabled();
  });

  it('opens and closes the panel', () => {
    renderDock();
    const openBtn = screen.getByRole('button', { name: /open panel/i });
    expect(openBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(openBtn);
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /close panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps the panel open on blur when the panel is fixed', async () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    fireEvent.click(screen.getByRole('switch', { name: /lock panel/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('panel-pinned')).toHaveTextContent('true');
    });

    fireEvent(window, new Event('blur'));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');
  });

  it('closes the panel on blur when it is not pinned and restores focus styling on focus', () => {
    const hasFocusSpy = vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    renderDock();

    const toolbar = screen.getByRole('toolbar', { name: /assistant controls/i });
    expect(toolbar.className).toContain('control-dock--dimmed');

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    fireEvent(window, new Event('blur'));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');

    fireEvent(window, new Event('focus'));
    expect(toolbar.className).not.toContain('control-dock--dimmed');

    hasFocusSpy.mockRestore();
  });
});
