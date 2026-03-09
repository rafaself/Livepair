import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { checkBackendHealth, requestSessionToken } from '../../api/backend';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';

vi.mock('../../api/backend', () => ({
  checkBackendHealth: vi.fn(),
  requestSessionToken: vi.fn(),
}));

function HookHarness(): JSX.Element {
  const togglePanel = useUiStore((state) => state.togglePanel);
  const controller = useAssistantPanelController();

  return (
    <div>
      <output aria-label="assistant-state">{controller.assistantState}</output>
      <output aria-label="backend-label">{controller.backendLabel}</output>
      <output aria-label="token-feedback">{controller.tokenFeedback ?? 'none'}</output>
      <output aria-label="panel-view">{controller.panelView}</output>
      <output aria-label="conversation-count">{String(controller.conversationTurns.length)}</output>
      <output aria-label="conversation-empty">{String(controller.isConversationEmpty)}</output>

      <button type="button" onClick={togglePanel}>
        toggle panel
      </button>
      <button type="button" onClick={() => void controller.handleStartTalking()}>
        start talking
      </button>
      <button type="button" onClick={() => controller.setAssistantState('listening')}>
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
    vi.mocked(checkBackendHealth).mockResolvedValue(true);
    vi.mocked(requestSessionToken).mockResolvedValue({
      token: 'stub-token',
      expiresAt: 'later',
      isStub: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('checks backend health when the panel is opened without promoting the session state', async () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    expect(checkBackendHealth).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByLabelText('backend-label')).toHaveTextContent('Connected');
    });
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('disconnected');
  });

  it('maps token request failures to the error state', async () => {
    vi.mocked(requestSessionToken).mockRejectedValueOnce(new Error('token failed'));

    render(<HookHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'start talking' }));

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
    });
    expect(screen.getByLabelText('token-feedback')).toHaveTextContent('Connection failed');
  });

  it('routes direct assistant state changes through the session store', () => {
    render(<HookHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'start mock session' }));
    expect(useSessionStore.getState().assistantState).toBe('listening');
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('listening');
  });
});
