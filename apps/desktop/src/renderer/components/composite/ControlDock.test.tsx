import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const panelView = useUiStore((state) => state.panelView);
    const isPanelPinned = useSettingsStore((state) => state.settings.isPanelPinned);
    const { handleEndSession, handleStartSession, isSessionActive } = useSessionRuntime();

    return (
      <>
        <output aria-label="panel-open">{String(isPanelOpen)}</output>
        <output aria-label="panel-view">{panelView}</output>
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
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    });
    window.bridge.listDisplays = vi.fn().mockResolvedValue([]);
  });

  it('renders all four control buttons', () => {
    renderDock();
    expect(screen.getByRole('button', { name: /unmute microphone/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable camera/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start session/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open panel/i })).toBeInTheDocument();
  });

  it('shows start session button when disconnected and end session when active', () => {
    renderDock();
    fireEvent.click(screen.getByRole('button', { name: /start session/i }));

    return waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('listening');
      expect(screen.getByRole('button', { name: /end session/i })).toBeInTheDocument();
    });
  });

  it('toggles microphone and camera state labels and can end an active session', () => {
    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /unmute microphone/i }));
    expect(screen.getByRole('button', { name: /mute microphone/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /enable camera/i }));
    expect(screen.getByRole('button', { name: /disable camera/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /start session/i }));
    fireEvent.click(screen.getByRole('button', { name: /end session/i }));
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');
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

  it('dims the dock when the native overlay is unfocused and restores full opacity on focus', () => {
    act(() => {
      useUiStore.getState().setOverlayWindowState({
        isFocused: false,
        isVisible: true,
        isInteractive: false,
      });
    });
    renderDock();

    const toolbar = screen.getByRole('toolbar', { name: /assistant controls/i });
    expect(toolbar.className).toContain('control-dock--dimmed');

    act(() => {
      useUiStore.getState().setOverlayWindowState({
        isFocused: true,
        isVisible: true,
        isInteractive: false,
      });
    });
    expect(toolbar.className).not.toContain('control-dock--dimmed');
  });

  it('restores full opacity while hovered even when the native overlay is unfocused', () => {
    act(() => {
      useUiStore.getState().setOverlayWindowState({
        isFocused: false,
        isVisible: true,
        isInteractive: false,
      });
    });
    renderDock();

    const toolbar = screen.getByRole('toolbar', { name: /assistant controls/i });
    expect(toolbar.className).toContain('control-dock--dimmed');

    fireEvent.mouseEnter(toolbar);
    expect(toolbar.className).not.toContain('control-dock--dimmed');

    fireEvent.mouseLeave(toolbar);
    expect(toolbar.className).toContain('control-dock--dimmed');
  });

  it('shows a warning button for settings issues and deep-links to settings', () => {
    useUiStore.setState({
      settingsIssues: [
        {
          id: 'missing-overlay-display',
          severity: 'warning',
          summary: 'Dock and panel display is unavailable.',
          focusTarget: 'overlay-display',
        },
      ],
    });

    renderDock();

    fireEvent.click(screen.getByRole('button', { name: /open warnings/i }));

    expect(screen.getByLabelText('panel-open')).toHaveTextContent('true');
    expect(screen.getByLabelText('panel-view')).toHaveTextContent('settings');
  });
});
