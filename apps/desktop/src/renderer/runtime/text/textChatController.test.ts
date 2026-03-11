import { describe, expect, it, vi } from 'vitest';
import { createTextChatController } from './textChatController';

function createMockOps(textStatus = 'idle') {
  const storeState = {
    textSessionLifecycle: { status: textStatus },
    activeTransport: null,
    conversationTurns: [] as { role: string; content: string; state: string }[],
    setTextSessionLifecycle: vi.fn(),
    setAssistantActivity: vi.fn(),
    setLastDebugEvent: vi.fn(),
    setLastRuntimeError: vi.fn(),
    resetTextSessionRuntime: vi.fn(),
    appendConversationTurn: vi.fn(),
    updateConversationTurn: vi.fn(),
  };
  const conversationCtx = {
    pendingAssistantTurnId: null,
    nextAssistantTurnId: 0,
    nextUserTurnId: 0,
    store: { getState: vi.fn().mockReturnValue(storeState) },
  };
  const stream = {
    cancel: vi.fn().mockResolvedValue(undefined),
  };

  return {
    store: { getState: vi.fn().mockReturnValue(storeState) } as never,
    logger: {
      onTransportEvent: vi.fn(),
      onSessionEvent: vi.fn(),
    },
    startTextChatStream: vi.fn().mockResolvedValue(stream),
    conversationCtx,
    startSessionInternal: vi.fn().mockImplementation(async () => {
      storeState.textSessionLifecycle.status = 'ready';
    }),
    setErrorState: vi.fn(),
    _storeState: storeState,
    _stream: stream,
  };
}

describe('createTextChatController', () => {
  describe('currentStatus', () => {
    it('reads status from store', () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      expect(controller.currentStatus()).toBe('ready');
    });
  });

  describe('applyLifecycleEvent', () => {
    it('updates store lifecycle when status changes', () => {
      const ops = createMockOps('idle');
      const controller = createTextChatController(ops as never);

      const result = controller.applyLifecycleEvent({ type: 'bootstrap.started' });

      expect(result).toBe('connecting');
      expect(ops._storeState.setTextSessionLifecycle).toHaveBeenCalledWith({ status: 'connecting' });
    });

    it('does not update store when status stays the same', () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      // transport.connected only transitions from 'connecting', so no-op from 'ready'
      controller.applyLifecycleEvent({ type: 'transport.connected' });

      expect(ops._storeState.setTextSessionLifecycle).not.toHaveBeenCalled();
    });
  });

  describe('handleStreamEvent', () => {
    it('applies delta event and appends text', () => {
      const ops = createMockOps('receiving');
      const controller = createTextChatController(ops as never);

      controller.handleStreamEvent({ type: 'text-delta', text: 'Hello' });

      // The lifecycle event is applied (receiving → receiving is a no-op but the call happens)
      // The main observable: no error state set
      expect(ops.setErrorState).not.toHaveBeenCalled();
    });

    it('handles completed event and sets assistant to idle', () => {
      const ops = createMockOps('receiving');
      const controller = createTextChatController(ops as never);

      controller.handleStreamEvent({ type: 'completed' });

      expect(ops._storeState.setAssistantActivity).toHaveBeenCalledWith('idle');
    });

    it('handles error event by setting error state', () => {
      const ops = createMockOps('receiving');
      const controller = createTextChatController(ops as never);

      controller.handleStreamEvent({ type: 'error', detail: 'stream broke' } as never);

      expect(ops.setErrorState).toHaveBeenCalledWith('stream broke', 'Response failed');
      expect(ops.logger.onTransportEvent).toHaveBeenCalledWith({
        type: 'error',
        detail: 'stream broke',
      });
    });
  });

  describe('ensureReady', () => {
    it('returns true if already ready', async () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      expect(await controller.ensureReady()).toBe(true);
      expect(ops.startSessionInternal).not.toHaveBeenCalled();
    });

    it('returns true if status is completed', async () => {
      const ops = createMockOps('completed');
      const controller = createTextChatController(ops as never);

      expect(await controller.ensureReady()).toBe(true);
    });

    it('starts session and returns true when startup succeeds', async () => {
      const ops = createMockOps('idle');
      const controller = createTextChatController(ops as never);

      expect(await controller.ensureReady()).toBe(true);
      expect(ops.startSessionInternal).toHaveBeenCalledWith({ mode: 'text' });
    });

    it('returns false when startup fails to reach ready', async () => {
      const ops = createMockOps('idle');
      ops.startSessionInternal.mockImplementation(async () => {
        ops._storeState.textSessionLifecycle.status = 'error';
      });
      const controller = createTextChatController(ops as never);

      expect(await controller.ensureReady()).toBe(false);
    });
  });

  describe('submitTurn', () => {
    it('returns false if a turn is already in flight', async () => {
      const ops = createMockOps('sending');
      const controller = createTextChatController(ops as never);

      expect(await controller.submitTurn('hello')).toBe(false);
    });

    it('starts session, submits stream, and returns true on success', async () => {
      const ops = createMockOps('idle');
      const controller = createTextChatController(ops as never);

      const result = await controller.submitTurn('hello');

      expect(result).toBe(true);
      expect(ops.startTextChatStream).toHaveBeenCalledTimes(1);
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith(null);
    });

    it('returns false and sets error when stream setup fails', async () => {
      const ops = createMockOps('idle');
      ops.startTextChatStream.mockRejectedValue(new Error('network error'));
      const controller = createTextChatController(ops as never);

      const result = await controller.submitTurn('hello');

      expect(result).toBe(false);
      expect(ops.setErrorState).toHaveBeenCalledWith('network error', 'Response failed');
    });

    it('returns false when session fails to become ready', async () => {
      const ops = createMockOps('idle');
      ops.startSessionInternal.mockImplementation(async () => {
        ops._storeState.textSessionLifecycle.status = 'error';
      });
      const controller = createTextChatController(ops as never);

      expect(await controller.submitTurn('hello')).toBe(false);
    });
  });

  describe('hasActiveStream', () => {
    it('returns false before any submit', () => {
      const ops = createMockOps();
      const controller = createTextChatController(ops as never);

      expect(controller.hasActiveStream()).toBe(false);
    });

    it('returns true after successful submit', async () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      await controller.submitTurn('test');

      expect(controller.hasActiveStream()).toBe(true);
    });

    it('returns false after stream is released via completed event', async () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      await controller.submitTurn('test');
      controller.handleStreamEvent({ type: 'completed' });

      expect(controller.hasActiveStream()).toBe(false);
    });
  });

  describe('hasRuntimeActivity', () => {
    it('returns false when idle with no stream', () => {
      const ops = createMockOps('idle');
      const controller = createTextChatController(ops as never);

      expect(controller.hasRuntimeActivity()).toBe(false);
    });

    it('returns true when text session is active', () => {
      const ops = createMockOps('sending');
      const controller = createTextChatController(ops as never);

      expect(controller.hasRuntimeActivity()).toBe(true);
    });

    it('returns true when activeTransport is backend-text', () => {
      const ops = createMockOps('idle');
      ops._storeState.activeTransport = 'backend-text';
      const controller = createTextChatController(ops as never);

      expect(controller.hasRuntimeActivity()).toBe(true);
    });
  });

  describe('releaseStream', () => {
    it('cancels active stream and nullifies it', async () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      await controller.submitTurn('test');
      controller.releaseStream();

      expect(ops._stream.cancel).toHaveBeenCalledTimes(1);
      expect(controller.hasActiveStream()).toBe(false);
    });

    it('is safe to call when no stream exists', () => {
      const ops = createMockOps();
      const controller = createTextChatController(ops as never);

      expect(() => controller.releaseStream()).not.toThrow();
    });
  });

  describe('resetRuntime', () => {
    it('resets text session runtime with default status', () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      controller.resetRuntime();

      expect(ops._storeState.resetTextSessionRuntime).toHaveBeenCalledWith('idle');
    });

    it('accepts a custom text session status', () => {
      const ops = createMockOps('ready');
      const controller = createTextChatController(ops as never);

      controller.resetRuntime('disconnected' as never);

      expect(ops._storeState.resetTextSessionRuntime).toHaveBeenCalledWith('disconnected');
    });
  });
});
