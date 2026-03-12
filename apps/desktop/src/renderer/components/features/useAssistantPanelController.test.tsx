import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { resetDesktopStores } from '../../store/testing';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { useSessionStore } from '../../store/sessionStore';
import { useAssistantPanelController } from './useAssistantPanelController';

function HookHarness(): JSX.Element {
  const togglePanel = useUiStore((state) => state.togglePanel);
  const controller = useAssistantPanelController();

  return (
    <div>
      <output aria-label="assistant-state">{controller.assistantState}</output>
      <output aria-label="current-mode">{controller.currentMode}</output>
      <output aria-label="backend-label">{controller.backendLabel}</output>
      <output aria-label="token-feedback">{controller.tokenFeedback ?? 'none'}</output>
      <output aria-label="runtime-error">{controller.lastRuntimeError ?? 'none'}</output>
      <output aria-label="text-session-status">{controller.textSessionStatus}</output>
      <output aria-label="text-session-label">{controller.textSessionStatusLabel}</output>
      <output aria-label="can-submit-text">{String(controller.canSubmitText)}</output>
      <output aria-label="panel-view">{controller.panelView}</output>
      <output aria-label="conversation-count">{String(controller.conversationTurns.length)}</output>
      <output aria-label="conversation-empty">{String(controller.isConversationEmpty)}</output>

      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={() => void controller.handleStartTalking()}>
        start talking
      </button>
      <button type="button" onClick={() => useSessionStore.getState().setAssistantState('listening')}>
        start mock session
      </button>
      <button type="button" onClick={() => controller.setPanelView('debug')}>
        open debug
      </button>
    </div>
  );
}

describe('useAssistantPanelController', () => {
  beforeEach(() => {
    resetDesktopStores();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    vi.clearAllMocks();
    window.bridge.checkHealth = vi.fn().mockResolvedValue({
      status: 'ok',
      timestamp: new Date('2026-03-09T00:00:00.000Z').toISOString(),
    });
    window.bridge.startTextChatStream = vi.fn(async () => ({
      cancel: vi.fn(async () => undefined),
    }));
    window.bridge.requestSessionToken = vi.fn().mockResolvedValue({
      token: 'ephemeral-token',
      expireTime: '2099-03-09T12:30:00.000Z',
      newSessionExpireTime: '2099-03-09T12:01:30.000Z',
    });
  });

  it('checks backend health when the panel is opened without promoting the session state', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(window.bridge.checkHealth).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByLabelText('backend-label')).toHaveTextContent('Connected');
    });
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');
  });

  it('starts text mode without requesting a Live token', async () => {
    render(<HookHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start talking' }));
    });

    expect(window.bridge.checkHealth).toHaveBeenCalledTimes(1);
    expect(window.bridge.requestSessionToken).not.toHaveBeenCalled();
    expect(window.bridge.startTextChatStream).not.toHaveBeenCalled();
    expect(screen.getByLabelText('current-mode')).toHaveTextContent('text');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
    expect(screen.getByLabelText('text-session-status')).toHaveTextContent('ready');
    expect(screen.getByLabelText('text-session-label')).toHaveTextContent('Text chat ready');
    expect(screen.getByLabelText('can-submit-text')).toHaveTextContent('true');
    expect(screen.getByLabelText('token-feedback')).toHaveTextContent('none');
  });

  it('maps unhealthy backend checks into the derived labels and states', async () => {
    window.bridge.checkHealth = vi.fn().mockRejectedValueOnce(new Error('backend down'));

    render(<HookHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    await waitFor(() => {
      expect(screen.getByLabelText('backend-label')).toHaveTextContent('Not connected');
    });
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
  });

  it('routes panel view and debug state mutations through the controller', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'open debug' }));
    fireEvent.click(screen.getByRole('button', { name: 'start mock session' }));

    expect(screen.getByLabelText('panel-view')).toHaveTextContent('debug');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('listening');
  });
});
