import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { selectAssistantRuntimeState } from '../../runtime/selectors';
import { useSessionRuntime } from '../../runtime/useSessionRuntime';
import { AssistantPanelSettingsView } from '../features/AssistantPanelSettingsView';
import { ControlDock } from './ControlDock';

function renderDock() {
  function DockHarness(): JSX.Element {
    const assistantState = useSessionStore(selectAssistantRuntimeState);
    const isPanelOpen = useUiStore((state) => state.isPanelOpen);
    const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);
    const {
      handleEndSession,
      handleStartSession,
      handleStartVoiceCapture,
      handleStopVoiceCapture,
      isSessionActive,
      voiceCaptureState,
    } = useSessionRuntime();

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <output aria-label="panel-pinned">{String(isPanelPinned)}</output>
        <output aria-label="assistant-state">{assistantState}</output>
        <output aria-label="voice-capture-state">{voiceCaptureState}</output>
        <ControlDock
          isSessionActive={isSessionActive}
          voiceCaptureState={voiceCaptureState}
          onStartVoiceCapture={handleStartVoiceCapture}
          onStopVoiceCapture={handleStopVoiceCapture}
          onStartSession={handleStartSession}
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
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
  });

  it('renders the microphone control and keeps voice session controls unavailable', () => {
    renderDock();

    expect(
      screen.getByRole('button', { name: /start microphone capture/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /camera unavailable in text mode/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /voice mode unavailable in text mode/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: /open panel/i })).toBeInTheDocument();
  });

  it('toggles local microphone capture from the dock', async () => {
    renderDock();

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
