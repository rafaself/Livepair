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
import type { LiveSessionEvent } from './transport.types';

const TEST_LIVE_CONFIG = parseLiveConfig({
  provider: 'gemini',
  adapterKey: 'gemini-live',
  model: 'models/gemini-2.0-flash-exp',
  apiVersion: 'v1alpha',
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
});

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
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
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
      config: TEST_LIVE_CONFIG,
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
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
  });

  it('connects voice mode with AUDIO response modality', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });

    await Promise.resolve();

    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
      config: {
        responseModalities: ['AUDIO'],
        tools: expect.any(Array),
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
  });

  it('passes voice-only compression and resume handle into the SDK connect config', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-exp',
        apiVersion: 'v1alpha',
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
        sessionResumptionEnabled: true,
        contextCompressionEnabled: true,
      }),
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      resumeHandle: 'handles/latest-voice-handle',
    });

    await Promise.resolve();

    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
      config: {
        responseModalities: ['AUDIO'],
        sessionResumption: {
          handle: 'handles/latest-voice-handle',
        },
        contextWindowCompression: {
          slidingWindow: {},
        },
        tools: expect.any(Array),
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

  it('normalizes Gemini tool calls into runtime events', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
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
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    sdkHarness.emitMessage({
      toolCall: {
        functionCalls: [
          {
            id: 'call-1',
            name: 'get_current_mode',
            args: {},
          },
        ],
      },
    });

    expect(events).toContainEqual({
      type: 'tool-call',
      calls: [
        {
          id: 'call-1',
          name: 'get_current_mode',
          arguments: {},
        },
      ],
    });
  });

  it('forwards normalized tool responses through the Gemini session', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    await transport.sendToolResponses([
      {
        id: 'call-1',
        name: 'get_current_mode',
        response: {
          ok: true,
          mode: 'voice',
        },
      },
    ]);

    expect(sdkHarness.session.sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        {
          id: 'call-1',
          name: 'get_current_mode',
          response: {
            ok: true,
            mode: 'voice',
          },
        },
      ],
    });
  });

  it('emits generation-complete before turn-complete when Gemini signals both distinctly', async () => {
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
        generationComplete: true,
        interrupted: false,
        turnComplete: true,
      },
      text: 'Done',
    });

    expect(events.slice(-4)).toEqual([
      {
        type: 'text-delta',
        text: 'Done',
      },
      {
        type: 'generation-complete',
      },
      {
        type: 'text-message',
        text: 'Done',
      },
      {
        type: 'turn-complete',
      },
    ]);
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

  it('emits go-away without downgrading the same session to a generic error', async () => {
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
      ]),
    );
    expect(events).not.toContainEqual({
      type: 'error',
      detail: 'transport offline',
    });
  });

  it('passes the latest resume handle into the SDK connect config', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-exp',
        apiVersion: 'v1alpha',
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
        sessionResumptionEnabled: true,
        contextCompressionEnabled: false,
      }),
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
      resumeHandle: 'handles/latest-voice-handle',
    });

    await Promise.resolve();

    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
      config: {
        responseModalities: ['AUDIO'],
        sessionResumption: {
          handle: 'handles/latest-voice-handle',
        },
        tools: expect.any(Array),
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
  });

  it('normalizes Gemini session resumption updates into handle and resumable flags', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-exp',
        apiVersion: 'v1alpha',
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
        sessionResumptionEnabled: true,
        contextCompressionEnabled: false,
      }),
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
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    sdkHarness.emitMessage({
      sessionResumptionUpdate: {
        newHandle: 'handles/voice-session-2',
        resumable: true,
      },
    });
    sdkHarness.emitMessage({
      sessionResumptionUpdate: {
        newHandle: 'handles/voice-session-3',
        resumable: false,
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'session-resumption-update',
          handle: 'handles/voice-session-2',
          resumable: true,
        },
        {
          type: 'session-resumption-update',
          handle: 'handles/voice-session-3',
          resumable: false,
          detail: 'Gemini Live session is not resumable at this point',
        },
      ]),
    );
  });

  it('emits connection termination separately from fatal errors after setup', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-exp',
        apiVersion: 'v1alpha',
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
        sessionResumptionEnabled: true,
        contextCompressionEnabled: false,
      }),
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
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
    sdkHarness.emitClose('transport recycled');

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'connection-terminated',
          detail: 'transport recycled',
        },
      ]),
    );
    expect(events).not.toContainEqual({
      type: 'error',
      detail: 'transport recycled',
    });
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

  it('sends audio chunks through realtime input with PCM metadata', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
    await transport.sendAudioChunk(new Uint8Array([1, 2, 3, 4]));

    expect(sdkHarness.session.sendRealtimeInput).toHaveBeenCalledWith({
      audio: {
        data: 'AQIDBA==',
        mimeType: 'audio/pcm;rate=16000',
      },
    });
  });

  it('sends audioStreamEnd when the local microphone stream stops', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
    await transport.sendAudioChunk(new Uint8Array([1, 2, 3, 4]));
    await transport.sendAudioStreamEnd();

    expect(sdkHarness.session.sendRealtimeInput).toHaveBeenCalledWith({
      audioStreamEnd: true,
    });
  });

  it('emits assistant audio chunks in order for voice sessions', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
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
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    sdkHarness.emitMessage({
      serverContent: {
        modelTurn: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'AQIDBA==',
              },
            },
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'BwgJCg==',
              },
            },
          ],
        },
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'audio-chunk',
          chunk: new Uint8Array([1, 2, 3, 4]),
        },
        {
          type: 'audio-chunk',
          chunk: new Uint8Array([7, 8, 9, 10]),
        },
      ]),
    );
  });

  it('emits input and output transcript events independently from assistant audio playback', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: parseLiveConfig({
        provider: 'gemini',
        adapterKey: 'gemini-live',
        model: 'models/gemini-2.0-flash-exp',
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
        mediaResolution: 'MEDIA_RESOLUTION_LOW',
        sessionResumptionEnabled: false,
        contextCompressionEnabled: false,
      }),
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
      mode: 'voice',
    });

    await Promise.resolve();

    expect(sdkHarness.getConnectOptions()).toEqual({
      apiKey: 'auth_tokens/test-token',
      apiVersion: 'v1alpha',
      model: 'models/gemini-2.0-flash-exp',
      config: {
        responseModalities: ['AUDIO'],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        tools: expect.any(Array),
      } satisfies GeminiLiveConnectConfig,
      callbacks: expect.any(Object),
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    sdkHarness.emitMessage({
      serverContent: {
        inputTranscription: {
          text: 'First user phrase',
        },
        outputTranscription: {
          text: 'First assistant phrase',
        },
        modelTurn: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: 'AQIDBA==',
              },
            },
          ],
        },
        turnComplete: true,
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'input-transcript',
          text: 'First user phrase',
        },
        {
          type: 'output-transcript',
          text: 'First assistant phrase',
        },
        {
          type: 'audio-chunk',
          chunk: new Uint8Array([1, 2, 3, 4]),
        },
        {
          type: 'turn-complete',
        },
      ]),
    );
  });

  it('emits a non-fatal audio error for malformed or unsupported assistant audio', async () => {
    const sdkHarness = createSdkHarness();
    const events: LiveSessionEvent[] = [];
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
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
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;

    sdkHarness.emitMessage({
      serverContent: {
        modelTurn: {
          role: 'model',
          parts: [
            {
              inlineData: {
                mimeType: 'audio/wav',
                data: 'AQIDBA==',
              },
            },
            {
              inlineData: {
                mimeType: 'audio/pcm;rate=24000',
                data: '***',
              },
            },
          ],
        },
      },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: 'audio-error',
          detail: 'Unsupported assistant audio format: audio/wav',
        },
        {
          type: 'audio-error',
          detail: 'Assistant audio payload was malformed',
        },
      ]),
    );
    expect(events).not.toContainEqual({
      type: 'error',
      detail: 'Assistant audio payload was malformed',
    });
  });

  it('sends video frames through realtime input with base64 encoding', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
    });

    const connectPromise = transport.connect({
      token: {
        token: 'auth_tokens/test-token',
        expireTime: '2099-03-09T12:30:00.000Z',
        newSessionExpireTime: '2099-03-09T12:01:30.000Z',
      },
      mode: 'voice',
    });

    sdkHarness.emitMessage({ setupComplete: {} });
    await connectPromise;
    await transport.sendVideoFrame(new Uint8Array([1, 2, 3, 4]), 'image/jpeg');

    expect(sdkHarness.session.sendRealtimeInput).toHaveBeenCalledWith({
      video: {
        data: 'AQIDBA==',
        mimeType: 'image/jpeg',
      },
    });
  });

  it('throws when sendVideoFrame is called without a connected session', async () => {
    const transport = createGeminiLiveTransport({ config: TEST_LIVE_CONFIG });
    await expect(
      transport.sendVideoFrame(new Uint8Array([1, 2]), 'image/jpeg'),
    ).rejects.toThrow('Gemini Live session is not connected');
  });

  it('throws when sendVideoFrame is called in text mode', async () => {
    const sdkHarness = createSdkHarness();
    const transport = createGeminiLiveTransport({
      connectSession: sdkHarness.connectSession,
      config: TEST_LIVE_CONFIG,
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

    await expect(
      transport.sendVideoFrame(new Uint8Array([1, 2]), 'image/jpeg'),
    ).rejects.toThrow('Gemini Live video input requires a voice session');
  });
});
