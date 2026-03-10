import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import {
  __emitGeminiLiveSdkClose,
  __emitGeminiLiveSdkMessage,
  __getLastGeminiLiveSdkConnectOptions,
  __resetGeminiLiveSdkMock,
} from '../../test/geminiLiveSdkMock';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';
import { selectAssistantRuntimeState } from '../../runtime/selectors';

function HookHarness(): JSX.Element {
  const togglePanel = useUiStore((state) => state.togglePanel);
  const controller = useAssistantPanelController();

  return (
    <div>
      <output aria-label="assistant-state">{controller.assistantState}</output>
      <output aria-label="backend-label">{controller.backendLabel}</output>
      <output aria-label="token-feedback">{controller.tokenFeedback ?? 'none'}</output>
      <output aria-label="runtime-error">{controller.lastRuntimeError ?? 'none'}</output>
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
    __resetGeminiLiveSdkMock();
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    vi.clearAllMocks();
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

  afterEach(() => {
    vi.useRealTimers();
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

  it('maps token request failures to the error state', async () => {
    window.bridge.requestSessionToken = vi.fn().mockRejectedValueOnce(new Error('token failed'));

    render(<HookHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'start talking' }));

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
    });
    expect(screen.getByLabelText('token-feedback')).toHaveTextContent('Connection failed');
  });

  it('maps healthy and unhealthy backend checks into the derived labels and states', async () => {
    window.bridge.checkHealth = vi.fn().mockRejectedValueOnce(new Error('backend down'));

    render(<HookHarness />);
    fireEvent.click(screen.getByRole('button', { name: 'toggle panel' }));

    await waitFor(() => {
      expect(screen.getByLabelText('backend-label')).toHaveTextContent('Not connected');
    });
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
  });

  it('derives the assistant state from realtime transport events instead of mock transcript timers', async () => {
    render(<HookHarness />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start talking' }));
    });

    await waitFor(() => {
      expect(window.bridge.requestSessionToken).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(__getLastGeminiLiveSdkConnectOptions()).toBeDefined();
    });
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('thinking');
    expect(screen.getByLabelText('conversation-count')).toHaveTextContent('0');

    act(() => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
    });
    expect(screen.getByLabelText('conversation-count')).toHaveTextContent('0');
    expect(selectAssistantRuntimeState(useSessionStore.getState())).toBe('ready');
  });

  it('surfaces transport failures and allows the next start to recover cleanly', async () => {
    render(<HookHarness />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start talking' }));
    });
    await waitFor(() => {
      expect(__getLastGeminiLiveSdkConnectOptions()).toBeDefined();
    });
    act(() => {
      __emitGeminiLiveSdkClose('transport offline');
    });

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
    });
    expect(screen.getByLabelText('runtime-error')).toHaveTextContent('transport offline');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start talking' }));
    });
    await waitFor(() => {
      expect(__getLastGeminiLiveSdkConnectOptions()).toBeDefined();
    });

    act(() => {
      __emitGeminiLiveSdkMessage({ setupComplete: {} });
    });

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
    });
    expect(screen.getByLabelText('runtime-error')).toHaveTextContent('none');
  });
});
