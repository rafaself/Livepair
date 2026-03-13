import { describe, expect, it, vi } from 'vitest';
import { createVoiceChunkPipeline } from './voiceChunkPipeline';

function createChunk(overrides: Partial<{
  data: Uint8Array;
  sequence: number;
  sampleRateHz: 16_000;
  channels: 1;
  encoding: 'pcm_s16le';
  durationMs: 20;
}> = {}) {
  return {
    data: new Uint8Array(640),
    sequence: 1,
    sampleRateHz: 16_000 as const,
    channels: 1 as const,
    encoding: 'pcm_s16le' as const,
    durationMs: 20 as const,
    ...overrides,
  };
}

function createMockOps() {
  const storeState = {
    voiceCaptureState: 'idle',
    voiceSessionStatus: 'ready',
    setVoiceCaptureState: vi.fn(),
    setVoiceCaptureDiagnostics: vi.fn(),
    setVoiceSessionStatus: vi.fn(),
    setLastRuntimeError: vi.fn(),
  };
  const capture = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const transport = {
    sendAudioChunk: vi.fn().mockResolvedValue(undefined),
    sendAudioStreamEnd: vi.fn().mockResolvedValue(undefined),
  };

  return {
    store: { getState: vi.fn().mockReturnValue(storeState) } as never,
    settingsStore: {
      getState: vi.fn().mockReturnValue({
        settings: {
          selectedInputDeviceId: 'usb-mic',
          voiceEchoCancellationEnabled: true,
          voiceNoiseSuppressionEnabled: true,
          voiceAutoGainControlEnabled: false,
        },
      }),
    } as never,
    createVoiceCapture: vi.fn().mockReturnValue(capture),
    getActiveTransport: vi.fn().mockReturnValue(transport),
    currentVoiceSessionStatus: vi.fn().mockReturnValue('ready'),
    setVoiceSessionStatus: vi.fn(),
    setVoiceErrorState: vi.fn(),
    endSessionInternal: vi.fn(),
    logRuntimeError: vi.fn(),
    _storeState: storeState,
    _capture: capture,
    _transport: transport,
  };
}

describe('createVoiceChunkPipeline', () => {
  describe('getVoiceCapture', () => {
    it('lazily creates voice capture on first call', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      const capture = pipeline.getVoiceCapture();

      expect(ops.createVoiceCapture).toHaveBeenCalledTimes(1);
      expect(capture).toBe(ops._capture);
    });

    it('returns the same instance on repeated calls', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      const first = pipeline.getVoiceCapture();
      const second = pipeline.getVoiceCapture();

      expect(ops.createVoiceCapture).toHaveBeenCalledTimes(1);
      expect(first).toBe(second);
    });
  });

  describe('hasCapture', () => {
    it('returns false before getVoiceCapture is called', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      expect(pipeline.hasCapture()).toBe(false);
    });

    it('returns true after getVoiceCapture is called', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();

      expect(pipeline.hasCapture()).toBe(true);
    });
  });

  describe('addChunkListener', () => {
    it('registers and unregisters chunk listeners', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);
      const listener = vi.fn();

      const unsubscribe = pipeline.addChunkListener(listener);
      // Trigger via capture observer
      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk({
        data: new Uint8Array(640).fill(1),
        sequence: 1,
        sampleRateHz: 16_000,
        durationMs: 20,
      });

      expect(listener).toHaveBeenCalledTimes(1);

      unsubscribe();
      observer.onChunk({
        data: new Uint8Array(640).fill(2),
        sequence: 2,
        sampleRateHz: 16_000,
        durationMs: 20,
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('capture observer callbacks', () => {
    it('onChunk updates diagnostics and enqueues send', async () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);
      const chunk = createChunk({
        data: new Uint8Array(640).fill(1),
      });

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(chunk);

      await pipeline.flush();

      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
        chunkCount: 1,
        sampleRateHz: 16_000,
        bytesPerChunk: 640,
        chunkDurationMs: 20,
        lastError: null,
      });
      expect(ops._transport.sendAudioChunk).toHaveBeenCalledWith(chunk.data);
    });

    it('forwards empty and undersized chunks unchanged', async () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);
      const emptyChunk = createChunk({
        data: new Uint8Array(0),
        sequence: 3,
      });
      const finalChunk = createChunk({
        data: new Uint8Array([7, 8, 9]),
        sequence: 4,
      });

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(emptyChunk);
      observer.onChunk(finalChunk);

      await pipeline.flush();

      expect(ops._transport.sendAudioChunk).toHaveBeenNthCalledWith(1, emptyChunk.data);
      expect(ops._transport.sendAudioChunk).toHaveBeenNthCalledWith(2, finalChunk.data);
      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenNthCalledWith(1, {
        chunkCount: 3,
        sampleRateHz: 16_000,
        bytesPerChunk: 0,
        chunkDurationMs: 20,
        lastError: null,
      });
      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenNthCalledWith(2, {
        chunkCount: 4,
        sampleRateHz: 16_000,
        bytesPerChunk: 3,
        chunkDurationMs: 20,
        lastError: null,
      });
    });

    it('onDiagnostics updates store diagnostics', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onDiagnostics({ chunkCount: 5 });

      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({ chunkCount: 5 });
    });

    it('onError sets capture and session to error', () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onError('Permission denied');

      expect(ops._storeState.setVoiceCaptureState).toHaveBeenCalledWith('error');
      expect(ops._storeState.setVoiceSessionStatus).toHaveBeenCalledWith('error');
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith('Permission denied');
      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
        lastError: 'Permission denied',
      });
      expect(ops.logRuntimeError).toHaveBeenCalledWith(
        'voice-capture',
        'local capture failed',
        { detail: 'Permission denied' },
      );
    });
  });

  describe('enqueueChunkSend – state transitions', () => {
    it('transitions from ready to streaming after send', async () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('ready');
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk());
      await pipeline.flush();

      // First sets to capturing, then to streaming after send
      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('capturing');
      expect(ops.setVoiceSessionStatus).toHaveBeenCalledWith('streaming');
    });

    it('sends queued chunks in arrival order and flush waits for the queue before ending the stream', async () => {
      const ops = createMockOps();
      const order: string[] = [];
      let resolveFirstSend!: () => void;
      ops._transport.sendAudioChunk
        .mockImplementationOnce(() => {
          order.push('chunk-1:start');
          return new Promise<void>((resolve) => {
            resolveFirstSend = () => {
              order.push('chunk-1:end');
              resolve();
            };
          });
        })
        .mockImplementationOnce(async (data: Uint8Array) => {
          order.push(`chunk-${data[0]}`);
        });
      ops._transport.sendAudioStreamEnd.mockImplementation(async () => {
        order.push('stream-end');
      });
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk({ data: new Uint8Array([1]), sequence: 1 }));
      observer.onChunk(createChunk({ data: new Uint8Array([2]), sequence: 2 }));

      await Promise.resolve();
      expect(ops._transport.sendAudioChunk).toHaveBeenCalledTimes(1);

      resolveFirstSend();
      await pipeline.flush();

      expect(ops._transport.sendAudioChunk).toHaveBeenNthCalledWith(1, new Uint8Array([1]));
      expect(ops._transport.sendAudioChunk).toHaveBeenNthCalledWith(2, new Uint8Array([2]));
      expect(order).toEqual(['chunk-1:start', 'chunk-1:end', 'chunk-2', 'stream-end']);
    });

    it('drops microphone chunks while resume temporarily clears the active transport', async () => {
      const ops = createMockOps();
      ops.getActiveTransport.mockReturnValue(null);
      ops.currentVoiceSessionStatus.mockReturnValue('recovering');
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk());
      await pipeline.flush();

      expect(ops._transport.sendAudioChunk).not.toHaveBeenCalled();
      expect(ops.setVoiceSessionStatus).not.toHaveBeenCalledWith('streaming');
    });

    it('drops queued microphone chunks if resumption swaps the active transport before they send', async () => {
      const ops = createMockOps();
      let activeTransport: { sendAudioChunk: ReturnType<typeof vi.fn>; sendAudioStreamEnd: ReturnType<typeof vi.fn> } | null =
        ops._transport;
      const nextTransport = {
        sendAudioChunk: vi.fn().mockResolvedValue(undefined),
        sendAudioStreamEnd: vi.fn().mockResolvedValue(undefined),
      };
      let resolveFirstSend!: () => void;
      ops.getActiveTransport.mockImplementation(() => activeTransport as never);
      ops._transport.sendAudioChunk.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSend = () => resolve();
          }),
      );
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk({
        data: new Uint8Array([1]),
        sequence: 1,
      }));
      await Promise.resolve();
      observer.onChunk(createChunk({
        data: new Uint8Array([2]),
        sequence: 2,
      }));

      activeTransport = nextTransport;
      resolveFirstSend();
      await pipeline.flush();

      expect(ops._transport.sendAudioChunk).toHaveBeenCalledTimes(1);
      expect(nextTransport.sendAudioChunk).not.toHaveBeenCalled();
      expect(
        ops.setVoiceSessionStatus.mock.calls.filter(([status]) => status === 'streaming'),
      ).toHaveLength(0);
    });

    it('skips send when voice session is disconnected', async () => {
      const ops = createMockOps();
      ops.currentVoiceSessionStatus.mockReturnValue('disconnected');
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk());
      await pipeline.flush();

      expect(ops._transport.sendAudioChunk).not.toHaveBeenCalled();
    });

    it('surfaces send failures but keeps later queued chunks moving', async () => {
      const ops = createMockOps();
      ops._transport.sendAudioChunk
        .mockRejectedValueOnce(new Error('transport write failed'))
        .mockResolvedValueOnce(undefined);
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk({
        data: new Uint8Array([1]),
        sequence: 1,
      }));
      observer.onChunk(createChunk({
        data: new Uint8Array([2]),
        sequence: 2,
      }));

      await pipeline.flush();

      expect(ops._transport.sendAudioChunk).toHaveBeenCalledTimes(2);
      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
        lastError: 'transport write failed',
      });
      expect(ops.setVoiceErrorState).toHaveBeenCalledWith('transport write failed');
      expect(ops._transport.sendAudioStreamEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('startCapture', () => {
    it('starts capture with settings from settings store', async () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      const result = await pipeline.startCapture();

      expect(result).toBe(true);
      expect(ops._capture.start).toHaveBeenCalledWith({
        selectedInputDeviceId: 'usb-mic',
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: false,
      });
      expect(ops._storeState.setVoiceCaptureState).toHaveBeenCalledWith('requestingPermission');
    });

    it('returns true immediately if already capturing', async () => {
      const ops = createMockOps();
      ops._storeState.voiceCaptureState = 'capturing';
      const pipeline = createVoiceChunkPipeline(ops as never);

      const result = await pipeline.startCapture();

      expect(result).toBe(true);
      expect(ops._capture.start).not.toHaveBeenCalled();
    });

    it('returns true immediately if already requesting permission', async () => {
      const ops = createMockOps();
      ops._storeState.voiceCaptureState = 'requestingPermission';
      const pipeline = createVoiceChunkPipeline(ops as never);

      const result = await pipeline.startCapture();

      expect(result).toBe(true);
      expect(ops._capture.start).not.toHaveBeenCalled();
    });

    it('returns false with error if voice session not ready', async () => {
      const ops = createMockOps();
      ops._storeState.voiceSessionStatus = 'disconnected';
      const pipeline = createVoiceChunkPipeline(ops as never);

      const result = await pipeline.startCapture();

      expect(result).toBe(false);
      expect(ops._storeState.setVoiceCaptureState).toHaveBeenCalledWith('error');
      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
        lastError: 'Voice session is not ready',
      });
    });

    it('calls endSessionInternal when shutdownOnFailure is true and session not ready', async () => {
      const ops = createMockOps();
      ops._storeState.voiceSessionStatus = 'disconnected';
      const pipeline = createVoiceChunkPipeline(ops as never);

      await pipeline.startCapture({ shutdownOnFailure: true });

      expect(ops.endSessionInternal).toHaveBeenCalledWith({
        preserveLastRuntimeError: 'Voice session is not ready',
        preserveVoiceRuntimeDiagnostics: true,
      });
    });

    it('does not call endSessionInternal when shutdownOnFailure is false', async () => {
      const ops = createMockOps();
      ops._storeState.voiceSessionStatus = 'disconnected';
      const pipeline = createVoiceChunkPipeline(ops as never);

      await pipeline.startCapture({ shutdownOnFailure: false });

      expect(ops.endSessionInternal).not.toHaveBeenCalled();
    });

    it('handles capture start failure', async () => {
      const ops = createMockOps();
      ops._capture.start.mockRejectedValue(new Error('Mic denied'));
      const pipeline = createVoiceChunkPipeline(ops as never);

      const result = await pipeline.startCapture();

      expect(result).toBe(false);
      expect(ops._storeState.setVoiceCaptureState).toHaveBeenCalledWith('error');
      expect(ops._storeState.setVoiceSessionStatus).toHaveBeenCalledWith('error');
      expect(ops._storeState.setLastRuntimeError).toHaveBeenCalledWith('Mic denied');
    });

    it('calls endSessionInternal on capture start failure with shutdownOnFailure', async () => {
      const ops = createMockOps();
      ops._capture.start.mockRejectedValue(new Error('Mic denied'));
      const pipeline = createVoiceChunkPipeline(ops as never);

      await pipeline.startCapture({ shutdownOnFailure: true });

      expect(ops.endSessionInternal).toHaveBeenCalledWith({
        preserveLastRuntimeError: 'Mic denied',
        preserveVoiceRuntimeDiagnostics: true,
      });
    });

    it('initializes diagnostics with correct default values', async () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      await pipeline.startCapture();

      expect(ops._storeState.setVoiceCaptureDiagnostics).toHaveBeenCalledWith({
        chunkCount: 0,
        sampleRateHz: 16_000,
        bytesPerChunk: 640,
        chunkDurationMs: 20,
        selectedInputDeviceId: 'usb-mic',
        lastError: null,
      });
    });
  });

  describe('flush', () => {
    it('awaits pending sends and sends stream end', async () => {
      const ops = createMockOps();
      const pipeline = createVoiceChunkPipeline(ops as never);

      await pipeline.flush();

      expect(ops._transport.sendAudioStreamEnd).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetSendChain', () => {
    it('detaches flush from an in-flight send after reset', async () => {
      const ops = createMockOps();
      let resolveFirstSend!: () => void;
      ops._transport.sendAudioChunk.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSend = resolve;
          }),
      );
      const pipeline = createVoiceChunkPipeline(ops as never);

      pipeline.getVoiceCapture();
      const observer = ops.createVoiceCapture.mock.calls[0]![0];
      observer.onChunk(createChunk());
      await Promise.resolve();

      pipeline.resetSendChain();
      const flushPromise = pipeline.flush();
      await Promise.resolve();

      expect(ops._transport.sendAudioStreamEnd).toHaveBeenCalledTimes(1);

      resolveFirstSend();
      await flushPromise;
    });
  });
});
