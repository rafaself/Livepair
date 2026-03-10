import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import {
  __emitGeminiLiveSdkMessage,
  __getLastGeminiLiveSdkConnectOptions,
  __resetGeminiLiveSdkMock,
} from '../../test/geminiLiveSdkMock';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { selectAssistantRuntimeState } from '../../runtime/selectors';
import { useSessionRuntime } from '../../runtime/useSessionRuntime';
import { AssistantPanelSettingsView } from '../features/AssistantPanelSettingsView';
import { ControlDock } from './ControlDock';

async function connectLatestSession(): Promise<void> {
  await waitFor(() => {
    expect(__getLastGeminiLiveSdkConnectOptions()).toBeDefined();
  });

  act(() => {
    __emitGeminiLiveSdkMessage({ setupComplete: {} });
  });
}

function renderDock() {
  function DockHarness(): JSX.Element {
    const assistantState = useSessionStore(selectAssistantRuntimeState);
    const isPanelOpen = useUiStore((state) => state.isPanelOpen);
    const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);
    const { handleEndSession, handleStartSession, isSessionActive } = useSessionRuntime();

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <output aria-label="panel-pinned">{String(isPanelPinned)}</output>
        <output aria-label="assistant-state">{assistantState}</output>
        <ControlDock
          isSessionActive={isSessionActive}
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
    __resetGeminiLiveSdkMock();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    useUiStore.getState().initializeSettingsUi(DEFAULT_DESKTOP_SETTINGS);
    window.bridge.updateSettings = vi.fn(async (patch) => ({
      ...useSettingsStore.getState().settings,
      ...patch,
    }));
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });
    window.bridge.requestSessionToken = vi.fn().mockResolvedValue({
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
  });

  it('renders all four control buttons', () => {
    renderDock();
    expect(screen.getByRole('button', { name: /unmute microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open panel/i })).toBeInTheDocument();
  });

  it('shows start session button when disconnected and end session when active', async () => {
    renderDock();
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    await connectLatestSession();

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
      expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
    });
  });

  it('toggles microphone and camera state labels and can end an active session', async () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /unmute microphone/i }));
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /enable camera/i }));
    expect(screen.getByRole('button', { name: /disable camera/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    await connectLatestSession();
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');
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
