import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../test/store';
import { useUiStore } from '../../store/uiStore';
import { AssistantPanelPreferencesStandaloneView } from '../features/assistant-panel/AssistantPanelPreferencesView';
import { type ControlDockProps, ControlDock } from './ControlDock';

function createDockProps(
  overrides: Partial<ControlDockProps> = {},
): ControlDockProps {
  return {
    currentMode: 'inactive',
    speechLifecycleStatus: 'off',
    activeTransport: null,
    voiceSessionStatus: 'disconnected',
    voiceCaptureState: 'idle',
    screenCaptureState: 'disabled',
    onStartVoiceCapture: vi.fn(async () => undefined),
    onStopVoiceCapture: vi.fn(async () => undefined),
    onStartScreenCapture: vi.fn(async () => undefined),
    onStopScreenCapture: vi.fn(async () => undefined),
    onSendScreenNow: vi.fn(),
    onEndSession: vi.fn(async () => undefined),
    ...overrides,
  };
}

function renderDock(overrides: Partial<ControlDockProps> = {}) {
  const props = createDockProps(overrides);

  function DockHarness(): JSX.Element {
    const isPanelOpen = useUiStore((state) => state.isPanelOpen);
    const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <output aria-label="panel-pinned">{String(isPanelPinned)}</output>
        <ControlDock {...props} />
        <AssistantPanelPreferencesStandaloneView />
      </>
    );
  }

  return {
    ...render(<DockHarness />),
    props,
  };
}

describe('ControlDock', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
  });

  it('renders only the panel toggle when speech mode is inactive', () => {
    renderDock();

    expect(screen.getByRole('button', { name: /close panel/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start microphone capture/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /share screen/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /end live session/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /switch to speech mode/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /connect voice session/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /disconnect voice session/i })).toBeNull();
  });

  it('shows microphone and screen controls but hides the end control when the panel is open', () => {
    useUiStore.setState({ isPanelOpen: true });
    renderDock({
      currentMode: 'speech',
      speechLifecycleStatus: 'listening',
      activeTransport: 'gemini-live',
      voiceSessionStatus: 'ready',
      voiceCaptureState: 'stopped',
      screenCaptureState: 'disabled',
    });

    expect(screen.getByRole('button', { name: /start microphone capture/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /share screen/i })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /end live session/i })).toBeNull();
    expect(screen.getByRole('button', { name: /close panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('shows a compact end speech mode control only when the panel is closed and speech mode is active', () => {
    useUiStore.setState({ isPanelOpen: false });
    const { props } = renderDock({
      currentMode: 'speech',
      speechLifecycleStatus: 'listening',
      activeTransport: 'gemini-live',
      voiceSessionStatus: 'ready',
      voiceCaptureState: 'stopped',
      screenCaptureState: 'disabled',
    });

    expect(screen.getByRole('button', { name: /start microphone capture/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /share screen/i })).toBeEnabled();

    const endSpeechModeButton = screen.getByRole('button', { name: 'End Live session' });
    expect(endSpeechModeButton).toBeEnabled();
    expect(endSpeechModeButton).toHaveClass('control-dock__btn--danger');

    fireEvent.click(endSpeechModeButton);
    expect(props.onEndSession).toHaveBeenCalledTimes(1);
  });

  it('keeps microphone and screen controls available during interrupted and recovering speech states', () => {
    const { rerender } = render(
      <ControlDock
        {...createDockProps({
          currentMode: 'speech',
          speechLifecycleStatus: 'interrupted',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'interrupted',
          voiceCaptureState: 'stopped',
          screenCaptureState: 'disabled',
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /start microphone capture/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /share screen/i })).toBeEnabled();

    rerender(
      <ControlDock
        {...createDockProps({
          currentMode: 'speech',
          speechLifecycleStatus: 'recovering',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'recovering',
          voiceCaptureState: 'stopped',
          screenCaptureState: 'disabled',
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /start microphone capture/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /share screen/i })).toBeEnabled();
  });

  it('shows Send screen now only while screen sharing is active in manual mode', () => {
    useSettingsStore.setState({
      settings: {
        ...DEFAULT_DESKTOP_SETTINGS,
        screenContextMode: 'manual',
      },
      isReady: true,
    });
    const { props, rerender } = renderDock({
      currentMode: 'speech',
      speechLifecycleStatus: 'listening',
      activeTransport: 'gemini-live',
      voiceSessionStatus: 'ready',
      voiceCaptureState: 'stopped',
      screenCaptureState: 'capturing',
    });

    const sendScreenNowButton = screen.getByRole('button', { name: 'Send screen now' });
    fireEvent.click(sendScreenNowButton);
    expect(props.onSendScreenNow).toHaveBeenCalledTimes(1);

    useSettingsStore.setState({
      settings: {
        ...useSettingsStore.getState().settings,
        screenContextMode: 'continuous',
      },
    });

    rerender(
      <ControlDock
        {...createDockProps({
          currentMode: 'speech',
          speechLifecycleStatus: 'listening',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'ready',
          voiceCaptureState: 'stopped',
          screenCaptureState: 'capturing',
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Send screen now' })).toBeNull();
  });

  it('hides starting controls and disables teardown controls while speech mode is starting or ending', () => {
    useUiStore.setState({ isPanelOpen: false });
    const { rerender } = render(
      <ControlDock
        {...createDockProps({
          currentMode: 'speech',
          speechLifecycleStatus: 'starting',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'connecting',
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: /live session is starting/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /screen sharing unavailable while live session starts/i }),
    ).toBeNull();
    expect(screen.queryByRole('button', { name: 'Starting Live session' })).toBeNull();

    rerender(
      <ControlDock
        {...createDockProps({
          currentMode: 'speech',
          speechLifecycleStatus: 'ending',
          activeTransport: 'gemini-live',
          voiceSessionStatus: 'stopping',
        })}
      />,
    );

    expect(screen.getByRole('button', { name: /live session is ending/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /screen sharing unavailable while live session ends/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ending Live session' })).toBeDisabled();
  });

  it('keeps speech controls visible but disabled while speech teardown is still in progress', () => {
    useUiStore.setState({ isPanelOpen: false });
    renderDock({
      currentMode: 'inactive',
      speechLifecycleStatus: 'ending',
      activeTransport: null,
      voiceSessionStatus: 'stopping',
      voiceCaptureState: 'error',
      screenCaptureState: 'error',
    });

    expect(screen.getByRole('button', { name: /live session is ending/i })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /screen sharing unavailable while live session ends/i }),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Ending Live session' })).toBeDisabled();
  });

  it('disables mic and screen retries when the speech runtime is no longer ready', () => {
    renderDock({
      currentMode: 'speech',
      speechLifecycleStatus: 'listening',
      activeTransport: null,
      voiceSessionStatus: 'error',
      voiceCaptureState: 'error',
      screenCaptureState: 'error',
    });

    expect(
      screen.getByRole('button', { name: /microphone unavailable while live session starts/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: /screen sharing unavailable while live session starts/i }),
    ).toBeDisabled();
  });

  it('closes and reopens the panel', () => {
    renderDock();
    const closeButton = screen.getByRole('button', { name: /close panel/i });
    expect(closeButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(closeButton);
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
    expect(screen.getByRole('button', { name: /open panel/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: /open panel/i }));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');
    expect(screen.getByRole('button', { name: /close panel/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('keeps the panel open on blur when the panel is fixed', async () => {
    renderDock();

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
    expect(toolbar.className).not.toContain('control-dock--dimmed');

    fireEvent(window, new Event('blur'));
    expect(screen.getByLabelText('panel-open')).toHaveTextContent('false');
    expect(toolbar.className).toContain('control-dock--dimmed');

    fireEvent(window, new Event('focus'));
    expect(toolbar.className).not.toContain('control-dock--dimmed');

    hasFocusSpy.mockRestore();
  });
});
