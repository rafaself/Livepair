import { describe, expect, it, vi } from 'vitest';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import type { TransportEvent } from './types';

type WebSocketListenerMap = {
  open: Event;
  message: MessageEvent<string>;
  error: Event;
  close: CloseEvent;
};

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

class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readonly addEventListener = vi.fn(
    <T extends keyof WebSocketListenerMap>(
      type: T,
      listener: (event: WebSocketListenerMap[T]) => void,
    ) => {
      this.listeners[type].add(listener as never);
    },
  );

  readonly removeEventListener = vi.fn(
    <T extends keyof WebSocketListenerMap>(
      type: T,
      listener: (event: WebSocketListenerMap[T]) => void,
    ) => {
      this.listeners[type].delete(listener as never);
    },
  );

  readonly send = vi.fn((payload: string) => {
    this.sent.push(payload);
  });

  readonly close = vi.fn((code?: number, reason?: string) => {
    this.readyState = FakeWebSocket.CLOSING;
    this.emit('close', createCloseEvent(code, reason));
  });

  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  private readonly listeners = {
    open: new Set<(event: Event) => void>(),
    message: new Set<(event: MessageEvent<string>) => void>(),
    error: new Set<(event: Event) => void>(),
    close: new Set<(event: CloseEvent) => void>(),
  };

  emit<T extends keyof WebSocketListenerMap>(type: T, event: WebSocketListenerMap[T]): void {
    if (type === 'open') {
      this.readyState = FakeWebSocket.OPEN;
    }

    if (type === 'close') {
      this.readyState = FakeWebSocket.CLOSED;
    }

    this.listeners[type].forEach((listener) => {
      listener(event as never);
    });
  }
}

describe('createGeminiLiveTransport', () => {
  it('connects only after the socket opens and setup completes', async () => {
    const socket = new FakeWebSocket();
    const createWebSocket = vi.fn(() => socket as unknown as WebSocket);
    const events: TransportEvent[] = [];
    const transport = createGeminiLiveTransport({
      createWebSocket,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
    });

    expect(events).toEqual([{ type: 'transport.lifecycle', state: 'connecting' }]);
    expect(createWebSocket).toHaveBeenCalledWith(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=auth_tokens%2Ftest-token',
    );

    socket.emit('open', new Event('open'));

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        setup: {
          model: 'models/gemini-2.0-flash-exp',
          generationConfig: {
            responseModalities: ['TEXT'],
          },
        },
      }),
    );
    expect(events).toEqual([{ type: 'transport.lifecycle', state: 'connecting' }]);

    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ setupComplete: {} }),
      }),
    );
    await connectPromise;

    expect(events).toEqual([
      { type: 'transport.lifecycle', state: 'connecting' },
      { type: 'transport.lifecycle', state: 'connected' },
    ]);
  });

  it('disconnects cleanly and emits a disconnected lifecycle event', async () => {
    const socket = new FakeWebSocket();
    const events: TransportEvent[] = [];
    const transport = createGeminiLiveTransport({
      createWebSocket: vi.fn(() => socket as unknown as WebSocket),
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
    });

    socket.emit('open', new Event('open'));
    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ setupComplete: {} }),
      }),
    );
    await connectPromise;
    await transport.disconnect();

    expect(socket.close).toHaveBeenCalledWith(1000, 'Client ended session');
    expect(events.at(-1)).toEqual({ type: 'transport.lifecycle', state: 'disconnected' });
  });

  it('sends text turns and streams assistant transcript updates', async () => {
    const socket = new FakeWebSocket();
    const events: TransportEvent[] = [];
    const transport = createGeminiLiveTransport({
      createWebSocket: vi.fn(() => socket as unknown as WebSocket),
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
    });

    socket.emit('open', new Event('open'));
    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ setupComplete: {} }),
      }),
    );
    await connectPromise;

    await transport.sendText('Hello from the desktop runtime');

    expect(socket.send).toHaveBeenLastCalledWith(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: 'Hello from the desktop runtime' }],
            },
          ],
          turnComplete: true,
        },
      }),
    );

    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [{ text: 'Streaming' }],
            },
          },
        }),
      }),
    );
    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [{ text: ' response' }],
            },
          },
        }),
      }),
    );
    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          serverContent: {
            turnComplete: true,
          },
        }),
      }),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'conversation.turn.appended',
          turn: expect.objectContaining({
            role: 'assistant',
            content: 'Streaming',
            state: 'streaming',
          }),
        },
        {
          type: 'conversation.turn.updated',
          turnId: expect.any(String),
          content: 'Streaming response',
          state: 'streaming',
          statusLabel: 'Responding...',
        },
        {
          type: 'conversation.turn.updated',
          turnId: expect.any(String),
          content: 'Streaming response',
          state: 'complete',
          statusLabel: undefined,
        },
        {
          type: 'assistant.activity',
          activity: 'ready',
        },
      ]),
    );
  });

  it('marks a partial assistant turn as failed when the socket closes mid-stream', async () => {
    const socket = new FakeWebSocket();
    const events: TransportEvent[] = [];
    const transport = createGeminiLiveTransport({
      createWebSocket: vi.fn(() => socket as unknown as WebSocket),
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
    });

    socket.emit('open', new Event('open'));
    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ setupComplete: {} }),
      }),
    );
    await connectPromise;
    await transport.sendText('Hello from the desktop runtime');

    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          serverContent: {
            modelTurn: {
              parts: [{ text: 'Partial reply' }],
            },
          },
        }),
      }),
    );
    socket.emit('close', new CloseEvent('close', { code: 1011, reason: 'transport offline' }));

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'conversation.turn.updated',
          turnId: expect.any(String),
          content: 'Partial reply',
          state: 'error',
          statusLabel: 'Disconnected',
        },
        {
          type: 'transport.lifecycle',
          state: 'error',
          detail: 'transport offline',
        },
      ]),
    );
  });

  it('emits an error and rejects connect when setup fails', async () => {
    const socket = new FakeWebSocket();
    const events: TransportEvent[] = [];
    const transport = createGeminiLiveTransport({
      createWebSocket: vi.fn(() => socket as unknown as WebSocket),
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: 'later',
        newSessionExpireTime: 'soon',
      },
    });

    socket.emit('open', new Event('open'));
    socket.emit('close', new CloseEvent('close', { code: 1011, reason: 'setup failed' }));

    await expect(connectPromise).rejects.toThrow('setup failed');
    expect(events.at(-1)).toEqual({
      type: 'transport.lifecycle',
      state: 'error',
      detail: 'setup failed',
    });
  });
});
