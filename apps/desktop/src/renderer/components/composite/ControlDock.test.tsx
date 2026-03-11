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
      currentMode,
      handleEndSession,
      handleStartVoiceSession,
      handleStartVoiceCapture,
      handleStopVoiceCapture,
      handleStartScreenCapture,
      handleStopScreenCapture,
      isVoiceSessionActive,
      speechLifecycleStatus,
      voiceCaptureState,
      screenCaptureState,
    } = useSessionRuntime();

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <output aria-label="panel-pinned">{String(isPanelPinned)}</output>
        <output aria-label="assistant-state">{assistantState}</output>
        <output aria-label="current-mode">{currentMode}</output>
        <output aria-label="speech-lifecycle-status">{speechLifecycleStatus}</output>
        <output aria-label="voice-capture-state">{voiceCaptureState}</output>
        <output aria-label="screen-capture-state">{screenCaptureState}</output>
        <ControlDock
          currentMode={currentMode}
          isVoiceSessionActive={isVoiceSessionActive}
          speechLifecycleStatus={speechLifecycleStatus}
          voiceCaptureState={voiceCaptureState}
          screenCaptureState={screenCaptureState}
          onStartVoiceSession={handleStartVoiceSession}
          onStartVoiceCapture={handleStartVoiceCapture}
          onStopVoiceCapture={handleStopVoiceCapture}
          onStartScreenCapture={handleStartScreenCapture}
          onStopScreenCapture={handleStopScreenCapture}
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
      screen.getByRole('button', { name: /switch to speech mode to use microphone/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /switch to speech mode to use screen context/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /^switch to speech mode$/i }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: /open panel/i })).toBeInTheDocument();
  });

  it('keeps microphone controls available during interrupted and recovering voice states', () => {
    const noop = vi.fn(async () => undefined);
    const { rerender } = render(
      <ControlDock
        currentMode="speech"
        isVoiceSessionActive
        speechLifecycleStatus="interrupted"
        voiceCaptureState="stopped"
        screenCaptureState="disabled"
        onStartVoiceSession={noop}
        onStartVoiceCapture={noop}
        onStopVoiceCapture={noop}
        onStartScreenCapture={noop}
        onStopScreenCapture={noop}
        onEndSession={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: /start microphone capture/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /start screen context/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /disconnect voice session/i }),
    ).toBeEnabled();

    rerender(
      <ControlDock
        currentMode="speech"
        isVoiceSessionActive
        speechLifecycleStatus="recovering"
        voiceCaptureState="stopped"
        screenCaptureState="disabled"
        onStartVoiceSession={noop}
        onStartVoiceCapture={noop}
        onStopVoiceCapture={noop}
        onStartScreenCapture={noop}
        onStopScreenCapture={noop}
        onEndSession={noop}
      />,
    );

    expect(
      screen.getByRole('button', { name: /start microphone capture/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /start screen context/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /disconnect voice session/i }),
    ).toBeEnabled();
  });

  it('connects voice mode and then toggles local microphone capture from the dock', async () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /^switch to speech mode$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('current-mode')).toHaveTextContent('speech');
      expect(screen.getByLabelText('speech-lifecycle-status')).toHaveTextContent('starting');
    });
    await act(async () => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('speech-lifecycle-status')).toHaveTextContent('listening');
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

  it('toggles screen context from the dock during an active voice session', async () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /^switch to speech mode$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('current-mode')).toHaveTextContent('speech');
      expect(screen.getByLabelText('speech-lifecycle-status')).toHaveTextContent('starting');
    });
    await act(async () => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /start screen context/i }),
      ).toBeEnabled();
      expect(screen.getByLabelText('voice-capture-state')).toHaveTextContent('capturing');
    });

    fireEvent.click(screen.getByRole('button', { name: /start screen context/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('screen-capture-state')).toHaveTextContent(/capturing|streaming/);
    });

    fireEvent.click(screen.getByRole('button', { name: /stop screen context/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('screen-capture-state')).toHaveTextContent('disabled');
    });
  });

  it('keeps speech-only controls unavailable while text mode is active but allows switching modes', async () => {
    useSessionStore.getState().setCurrentMode('text');
    useSessionStore.getState().setTextSessionLifecycle({ status: 'ready' });
    renderDock();

    expect(
      screen.getByRole('button', { name: /switch to speech mode to use microphone/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /switch to speech mode to use screen context/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /^switch to speech mode$/i })).toBeEnabled();
  });

  it('switches from text mode into speech mode from the dock', async () => {
    useSessionStore.getState().setCurrentMode('text');
    useSessionStore.getState().setTextSessionLifecycle({ status: 'ready' });
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /^switch to speech mode$/i }));

    await waitFor(() => {
      expect(screen.getByLabelText('current-mode')).toHaveTextContent('speech');
    });
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
