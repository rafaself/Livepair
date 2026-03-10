import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DESKTOP_SETTINGS } from '../../../shared/settings';
import { useSessionStore } from '../../store/sessionStore';
import { useSettingsStore } from '../../store/settingsStore';
import { resetDesktopStores } from '../../store/testing';
import { useUiStore } from '../../store/uiStore';
import { useAssistantPanelController } from './useAssistantPanelController';
import { selectAssistantRuntimeState } from '../../runtime/selectors';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly addEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      this.listeners.get(type)?.add(listener);
    },
  );

  readonly removeEventListener = vi.fn(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      this.listeners.get(type)?.delete(listener);
    },
  );

  readonly send = vi.fn();
  readonly close = vi.fn((code?: number, reason?: string) => {
    this.readyState = FakeWebSocket.CLOSING;
    this.emit('close', createCloseEvent(code, reason));
  });

  readyState = FakeWebSocket.CONNECTING;

  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>([
    ['open', new Set()],
    ['message', new Set()],
    ['error', new Set()],
    ['close', new Set()],
  ]);

  constructor(public readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  emit(type: 'open' | 'error', event: Event): void;
  emit(type: 'message', event: MessageEvent<string>): void;
  emit(type: 'close', event: CloseEvent): void;
  emit(
    type: 'open' | 'message' | 'error' | 'close',
    event: Event | MessageEvent<string> | CloseEvent,
  ): void {
    if (type === 'open') {
      this.readyState = FakeWebSocket.OPEN;
    }

    if (type === 'close') {
      this.readyState = FakeWebSocket.CLOSED;
    }

    this.listeners.get(type)?.forEach((listener) => {
      if (typeof listener === 'function') {
        listener(event);
        return;
      }

      listener.handleEvent(event);
    });
  }
}

function createCloseEvent(code?: number, reason?: string): CloseEvent {
  const init: CloseEventInit = {};

  if (code !== undefined) {
    init.code = code;
  }

  if (reason !== undefined) {
    init.reason = reason;
  }

  return new CloseEvent('close', init);
}

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
    FakeWebSocket.instances = [];
    useSettingsStore.setState({ settings: DEFAULT_DESKTOP_SETTINGS, isReady: true });
    vi.clearAllMocks();
    vi.stubGlobal('WebSocket', FakeWebSocket);
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
    vi.unstubAllGlobals();
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
    expect(screen.getByLabelText('assistant-state')).toHaveTextContent('thinking');
    expect(screen.getByLabelText('conversation-count')).toHaveTextContent('0');
    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    const [socket] = FakeWebSocket.instances;
    expect(socket).toBeDefined();
    if (!socket) {
      throw new Error('Expected a realtime socket');
    }
    expect(socket.url).toContain('BidiGenerateContent');

    act(() => {
      socket.emit('open', new Event('open'));
      socket.emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ setupComplete: {} }),
        }),
      );
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
      expect(FakeWebSocket.instances).toHaveLength(1);
    });

    const [firstSocket] = FakeWebSocket.instances;
    expect(firstSocket).toBeDefined();
    if (!firstSocket) {
      throw new Error('Expected a realtime socket');
    }
    act(() => {
      firstSocket.emit('open', new Event('open'));
      firstSocket.emit(
        'close',
        new CloseEvent('close', { code: 1011, reason: 'transport offline' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('error');
    });
    expect(screen.getByLabelText('runtime-error')).toHaveTextContent('transport offline');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'start talking' }));
    });
    await waitFor(() => {
      expect(FakeWebSocket.instances).toHaveLength(2);
    });

    const secondSocket = FakeWebSocket.instances.at(-1);
    expect(secondSocket).not.toBe(firstSocket);

    act(() => {
      secondSocket?.emit('open', new Event('open'));
      secondSocket?.emit(
        'message',
        new MessageEvent('message', {
          data: JSON.stringify({ setupComplete: {} }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByLabelText('assistant-state')).toHaveTextContent('ready');
    });
    expect(screen.getByLabelText('runtime-error')).toHaveTextContent('none');
  });
});
