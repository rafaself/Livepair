import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AudioWorkletNodeLike,
  CreateLocalVoiceCaptureDependencies,
  LocalVoiceCaptureObserver,
  MediaStreamAudioSourceNodeLike,
} from './localVoiceCapture';
import {
  PCM16_CHUNK_BYTE_SIZE,
  TARGET_VOICE_SAMPLE_RATE,
} from './audioProcessing';
import { createLocalVoiceCapture } from './localVoiceCapture';

type MediaTrackLike = {
  stop: ReturnType<typeof vi.fn>;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
};

type MediaStreamLike = {
  getTracks: () => MediaTrackLike[];
};

function createObserver(): {
  observer: LocalVoiceCaptureObserver;
  onChunk: ReturnType<typeof vi.fn>;
  onDiagnostics: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  onSpeechActivity: ReturnType<typeof vi.fn>;
} {
  const onChunk = vi.fn();
  const onDiagnostics = vi.fn();
  const onError = vi.fn();
  const onSpeechActivity = vi.fn();

  return {
    observer: {
      onChunk,
      onDiagnostics,
      onError,
      onSpeechActivity,
    },
    onChunk,
    onDiagnostics,
    onError,
    onSpeechActivity,
  };
}

function createHarness({
  getUserMediaImpl,
}: {
  getUserMediaImpl?: ReturnType<typeof vi.fn>;
} = {}): {
  capture: ReturnType<typeof createLocalVoiceCapture>;
  dependencies: CreateLocalVoiceCaptureDependencies;
  observer: ReturnType<typeof createObserver>;
  getUserMedia: ReturnType<typeof vi.fn>;
  audioContext: {
    close: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    createMediaStreamSource: ReturnType<typeof vi.fn>;
    audioWorklet: {
      addModule: ReturnType<typeof vi.fn>;
    };
    sampleRate: number;
  };
  sourceNode: MediaStreamAudioSourceNodeLike;
  workletNode: AudioWorkletNodeLike;
  track: MediaTrackLike;
  stream: MediaStreamLike;
} {
  const observer = createObserver();
  const track: MediaTrackLike = {
    stop: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  const stream: MediaStreamLike = {
    getTracks: () => [track],
  };
  const sourceNode: MediaStreamAudioSourceNodeLike = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const port = {
    onmessage: null as ((event: MessageEvent) => void) | null,
    onmessageerror: null as ((event: MessageEvent) => void) | null,
  };
  const workletNode: AudioWorkletNodeLike = {
    port,
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const audioContext = {
    close: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    createMediaStreamSource: vi.fn(() => sourceNode),
    audioWorklet: {
      addModule: vi.fn(async () => undefined),
    },
    sampleRate: 48_000,
  };
  const getUserMedia = getUserMediaImpl ?? vi.fn(async () => stream);
  const dependencies: CreateLocalVoiceCaptureDependencies = {
    mediaDevices: {
      getUserMedia,
    },
    createAudioContext: () => audioContext,
    createAudioWorkletNode: () => workletNode,
    loadCaptureWorklet: vi.fn(async () => undefined),
  };

  return {
    capture: createLocalVoiceCapture(observer.observer, dependencies),
    dependencies,
    observer,
    getUserMedia,
    audioContext,
    sourceNode,
    workletNode,
    track,
    stream,
  };
}

describe('createLocalVoiceCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts local capture, normalizes chunks, and emits diagnostics', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });
    harness.workletNode.port.onmessage?.({
      data: {
        channels: [
          Float32Array.from(
            { length: 960 },
            (_value, index) => (index % 2 === 0 ? 0.25 : -0.25),
          ),
        ],
      },
    } as MessageEvent);

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    expect(harness.audioContext.resume).toHaveBeenCalledTimes(1);
    expect(harness.sourceNode.connect).toHaveBeenCalledWith(harness.workletNode);
    expect(harness.observer.onChunk).toHaveBeenCalledWith(
      expect.objectContaining({
        sampleRateHz: TARGET_VOICE_SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_s16le',
        durationMs: 20,
        sequence: 1,
        data: expect.any(Uint8Array),
      }),
    );
    const emittedChunk = harness.observer.onChunk.mock.calls[0]?.[0];
    expect(emittedChunk?.data).toHaveLength(PCM16_CHUNK_BYTE_SIZE);
    expect(harness.observer.onDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        chunkCount: 1,
        sampleRateHz: TARGET_VOICE_SAMPLE_RATE,
        bytesPerChunk: PCM16_CHUNK_BYTE_SIZE,
        chunkDurationMs: 20,
        selectedInputDeviceId: 'default',
        lastError: null,
      }),
    );
  });

  it('uses an exact device constraint when a non-default microphone is selected', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'usb-mic',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: true,
        channelCount: { ideal: 1 },
        deviceId: { exact: 'usb-mic' },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
  });

  it('stops tracks and releases audio resources cleanly', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });
    await harness.capture.stop();

    expect(harness.sourceNode.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.workletNode.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.track.stop).toHaveBeenCalledTimes(1);
    expect(harness.audioContext.close).toHaveBeenCalledTimes(1);
  });

  it('cleans up and reports an error when the microphone track ends unexpectedly', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });

    const endedListener = harness.track.addEventListener.mock.calls.find(
      ([type]) => type === 'ended',
    )?.[1] as (() => void) | undefined;

    expect(endedListener).toBeTypeOf('function');

    endedListener?.();
    await Promise.resolve();

    expect(harness.observer.onError).toHaveBeenCalledWith(
      'Microphone capture stopped unexpectedly',
    );
    expect(harness.observer.onDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: 'Microphone capture stopped unexpectedly',
        selectedInputDeviceId: 'default',
      }),
    );
    expect(harness.track.removeEventListener).toHaveBeenCalledWith(
      'ended',
      endedListener,
    );
    expect(harness.sourceNode.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.workletNode.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.track.stop).toHaveBeenCalledTimes(1);
    expect(harness.audioContext.close).toHaveBeenCalledTimes(1);
    expect(harness.observer.onSpeechActivity).toHaveBeenLastCalledWith(false);
  });

  it('surfaces permission errors as readable diagnostics', async () => {
    const harness = createHarness({
      getUserMediaImpl: vi.fn(async () => {
        const error = new Error('Permission denied');
        Object.assign(error, { name: 'NotAllowedError' });
        throw error;
      }),
    });

    await expect(
      harness.capture.start({
        selectedInputDeviceId: 'default',
        echoCancellationEnabled: true,
        noiseSuppressionEnabled: true,
        autoGainControlEnabled: true,
      }),
    ).rejects.toThrow('Microphone permission was denied');
    expect(harness.observer.onError).toHaveBeenCalledWith('Microphone permission was denied');
    expect(harness.observer.onDiagnostics).toHaveBeenCalledWith(
      expect.objectContaining({
        lastError: 'Microphone permission was denied',
      }),
    );
  });

  it('applies persisted browser audio cleanup flags when starting capture', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: false,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: false,
    });

    expect(harness.getUserMedia).toHaveBeenCalledWith({
      audio: {
        autoGainControl: false,
        channelCount: { ideal: 1 },
        echoCancellation: false,
        noiseSuppression: true,
      },
    });
  });

  it('forwards speech-activity:true from worklet to onSpeechActivity observer', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });
    harness.workletNode.port.onmessage?.({
      data: { type: 'speech-activity', active: true },
    } as MessageEvent);

    expect(harness.observer.onSpeechActivity).toHaveBeenCalledWith(true);
    expect(harness.observer.onSpeechActivity).toHaveBeenCalledTimes(1);
  });

  it('forwards speech-activity:false from worklet to onSpeechActivity observer', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });
    harness.workletNode.port.onmessage?.({
      data: { type: 'speech-activity', active: true },
    } as MessageEvent);
    harness.workletNode.port.onmessage?.({
      data: { type: 'speech-activity', active: false },
    } as MessageEvent);

    expect(harness.observer.onSpeechActivity).toHaveBeenLastCalledWith(false);
    expect(harness.observer.onSpeechActivity).toHaveBeenCalledTimes(2);
  });

  it('calls onSpeechActivity(false) when capture stops', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });
    // Simulate worklet signalling speech active
    harness.workletNode.port.onmessage?.({
      data: { type: 'speech-activity', active: true },
    } as MessageEvent);
    expect(harness.observer.onSpeechActivity).toHaveBeenCalledWith(true);

    await harness.capture.stop();

    expect(harness.observer.onSpeechActivity).toHaveBeenLastCalledWith(false);
  });

  it('does not call onSpeechActivity for regular audio frame messages', async () => {
    const harness = createHarness();

    await harness.capture.start({
      selectedInputDeviceId: 'default',
      echoCancellationEnabled: true,
      noiseSuppressionEnabled: true,
      autoGainControlEnabled: true,
    });
    harness.workletNode.port.onmessage?.({
      data: {
        channels: [Float32Array.from({ length: 128 }, () => 0)],
      },
    } as MessageEvent);

    expect(harness.observer.onSpeechActivity).not.toHaveBeenCalled();
    expect(harness.observer.onChunk).not.toHaveBeenCalled();
  });
});
