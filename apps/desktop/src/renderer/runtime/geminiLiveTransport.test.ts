import { describe, expect, it, vi } from 'vitest';
import { createGeminiLiveTransport } from './geminiLiveTransport';
import {
  parseLiveConfig,
  type GeminiLiveConnectConfig,
} from './liveConfig';
import type {
  ConnectGeminiLiveSdkSessionOptions,
  GeminiLiveSdkServerMessage,
  GeminiLiveSdkSession,
} from './geminiLiveSdkClient';
import type { LiveSessionEvent } from './types';

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

function createSdkHarness(): {
  session: GeminiLiveSdkSession;
  connectSession: ReturnType<typeof vi.fn>;
  emitOpen: () => void;
  emitMessage: (message: GeminiLiveSdkServerMessage) => void;
  emitError: (detail?: string) => void;
  emitClose: (detail?: string, code?: number) => void;
  getConnectOptions: () => ConnectGeminiLiveSdkSessionOptions | undefined;
} {
  let callbacks: ConnectGeminiLiveSdkSessionOptions['callbacks'] | null = null;
  let connectOptions: ConnectGeminiLiveSdkSessionOptions | undefined;

  const session: GeminiLiveSdkSession = {
    sendClientContent: vi.fn(),
    close: vi.fn(() => {
      callbacks?.onClose?.(createCloseEvent(1000, 'Client ended session'));
    }),
  };

  return {
    session,
    connectSession: vi.fn(async (options: ConnectGeminiLiveSdkSessionOptions) => {
      connectOptions = options;
      callbacks = options.callbacks;
      return session;
    }),
    emitOpen: () => {
      callbacks?.onOpen?.();
    },
    emitMessage: (message) => {
      callbacks?.onMessage(message);
    },
    emitError: (detail = 'Gemini Live connection failed') => {
      callbacks?.onError?.(
        new ErrorEvent('error', {
          message: detail,
          error: new Error(detail),
        }),
      );
    },
    emitClose: (detail = 'Gemini Live session closed unexpectedly', code = 1011) => {
      callbacks?.onClose?.(createCloseEvent(code, detail));
    },
    getConnectOptions: () => connectOptions,
  };
}

describe('createGeminiLiveTransport', () => {
  it('connects only after the SDK emits setupComplete', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    await Promise.resolve();

    expect(events).toEqual([{ type: 'connection-state-changed', state: 'connecting' }]);
    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
      config: {
        responseModalities: ['TEXT'],
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });

    sdkHarness.emitOpen();
    expect(events).toEqual([{ type: 'connection-state-changed', state: 'connecting' }]);

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    expect(events).toEqual([
      { type: 'connection-state-changed', state: 'connecting' },
      { type: 'connection-state-changed', state: 'connected' },
    ]);
  });

  it('derives the SDK connect config from centralized live config', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-live-001',
        apiVersion: 'v1alpha',
        sessionModes: {
          text: {
            responseModality: 'TEXT',
            inputAudioTranscription: false,
            outputAudioTranscription: false,
          },
          voice: {
            responseModality: 'AUDIO',
            inputAudioTranscription: true,
            outputAudioTranscription: true,
          },
        },
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        sessionResumptionEnabled: true,
        contextCompressionEnabled: true,
      }),
      connectSession: sdkHarness.connectSession,
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    await Promise.resolve();

    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-live-001',
      config: {
        responseModalities: ['TEXT'],
        mediaResolution: 'MEDIA_RESOLUTION_MEDIUM',
        sessionResumption: {},
        contextWindowCompression: {
          slidingWindow: {},
        },
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
  });

  it('disconnects cleanly and emits a disconnected state change', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
    await transport.disconnect();

    expect(sdkHarness.session.close).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({
      type: 'connection-state-changed',
      state: 'disconnected',
    });
  });

  it('sends text turns and maps streamed SDK text into contract events', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    await transport.sendText('Hello from the desktop runtime');

    expect(sdkHarness.session.sendClientContent).toHaveBeenCalledWith({
      turns: [
        {
          role: 'user',
          parts: [{ text: 'Hello from the desktop runtime' }],
        },
      ],
      turnComplete: true,
    });

    sdkHarness.emitMessage({
      serverContent: {
        interrupted: false,
        turnComplete: false,
      },
      text: 'Streaming',
    });
    sdkHarness.emitMessage({
      serverContent: {
        interrupted: false,
        turnComplete: true,
      },
      text: ' response',
    });

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
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
    await transport.sendText('Hello from the desktop runtime');

    sdkHarness.emitMessage({
      serverContent: {
        interrupted: true,
        turnComplete: false,
      },
      text: 'Partial reply',
    });

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
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    sdkHarness.emitMessage({
      goAway: {
        reason: 'transport offline',
      },
    });

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
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'text',
    });

    sdkHarness.emitClose('setup failed');

    await expect(connectPromise).rejects.toThrow('setup failed');
    expect(events.at(-1)).toEqual({
      type: 'error',
      detail: 'setup failed',
    });
  });

  it('rejects connect when the live config is incompatible with ephemeral-token SDK bootstrap', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-live-001',
        apiVersion: 'v1beta',
        sessionModes: {
          text: {
            responseModality: 'TEXT',
            inputAudioTranscription: false,
            outputAudioTranscription: false,
          },
          voice: {
            responseModality: 'AUDIO',
            inputAudioTranscription: false,
            outputAudioTranscription: false,
          },
        },
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
        sessionResumptionEnabled: false,
        contextCompressionEnabled: false,
      }),
      connectSession: sdkHarness.connectSession,
    });
    transport.subscribe((event) => {
      events.push(event);
    });

    await expect(
      transport.connect({
        token: {
          token: 'auth_tokens/test-token',
          expireTime: '2099-03-09T12:30:00.000Z',
          newSessionExpireTime: '2099-03-09T12:01:30.000Z',
        },
        mode: 'text',
      }),
    ).rejects.toThrow(
      'Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
    );

    expect(sdkHarness.connectSession).not.toHaveBeenCalled();
    expect(events.at(-1)).toEqual({
      type: 'error',
      detail:
        'Invalid Live config: Gemini Live ephemeral-token sessions require VITE_LIVE_API_VERSION to be "v1alpha"',
    });
  });

  it('rejects audio upload until voice mode is implemented', async () => {
    const transport = createGeminiLiveTransport({
      connectSession: vi.fn(),
    });

    await expect(transport.sendAudioChunk(new Uint8Array([1, 2, 3]))).rejects.toThrow(
      'Audio input is not implemented for Gemini Live yet',
    );
  });
});
