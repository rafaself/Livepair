import { describe, expect, it, vi } from 'vitest';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import type { LiveSessionEvent } from './types';

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
    const events: LiveSessionEvent[] = [];
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
      mode: 'text',
    });

    expect(events).toEqual([{ type: 'connection-state-changed', state: 'connecting' }]);
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
    expect(events).toEqual([{ type: 'connection-state-changed', state: 'connecting' }]);

    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ setupComplete: {} }),
      }),
    );
    await connectPromise;

    expect(events).toEqual([
      { type: 'connection-state-changed', state: 'connecting' },
      { type: 'connection-state-changed', state: 'connected' },
    ]);
  });

  it('disconnects cleanly and emits a disconnected state change', async () => {
    const socket = new FakeWebSocket();
    const events: LiveSessionEvent[] = [];
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
      mode: 'text',
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
    expect(events.at(-1)).toEqual({
      type: 'connection-state-changed',
      state: 'disconnected',
    });
  });

  it('sends text turns and maps streamed Gemini text into contract events', async () => {
    const socket = new FakeWebSocket();
    const events: LiveSessionEvent[] = [];
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
      mode: 'text',
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
            turnComplete: true,
          },
        }),
      }),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'text-delta',
          text: 'Streaming',
        },
        {
          type: 'text-delta',
          text: ' response',
        },
        {
          type: 'text-message',
          text: 'Streaming response',
        },
        {
          type: 'turn-complete',
        },
      ]),
    );
  });

  it('emits interrupted when Gemini marks the current turn as interrupted', async () => {
    const socket = new FakeWebSocket();
    const events: LiveSessionEvent[] = [];
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
      mode: 'text',
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
            interrupted: true,
          },
        }),
      }),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'text-delta',
          text: 'Partial reply',
        },
        {
          type: 'interrupted',
        },
      ]),
    );
  });

  it('emits go-away and error when Gemini rejects an active session', async () => {
    const socket = new FakeWebSocket();
    const events: LiveSessionEvent[] = [];
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
      mode: 'text',
    });

    socket.emit('open', new Event('open'));
    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({ setupComplete: {} }),
      }),
    );
    await connectPromise;

    socket.emit(
      'message',
      new MessageEvent('message', {
        data: JSON.stringify({
          goAway: {
            reason: 'transport offline',
          },
        }),
      }),
    );

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'go-away',
          detail: 'transport offline',
        },
        {
          type: 'error',
          detail: 'transport offline',
        },
      ]),
    );
  });

  it('emits an error and rejects connect when setup fails', async () => {
    const socket = new FakeWebSocket();
    const events: LiveSessionEvent[] = [];
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
      mode: 'text',
    });

    socket.emit('open', new Event('open'));
    socket.emit('close', new CloseEvent('close', { code: 1011, reason: 'setup failed' }));

    await expect(connectPromise).rejects.toThrow('setup failed');
    expect(events.at(-1)).toEqual({
      type: 'error',
      detail: 'setup failed',
    });
  });

  it('rejects audio upload until voice mode is implemented', async () => {
    const transport = createGeminiLiveTransport({
      createWebSocket: vi.fn(),
    });

    await expect(transport.sendAudioChunk(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'Audio input is not implemented for Gemini Live yet',
    );
  });
});
