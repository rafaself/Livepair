import { describe, expect, it, vi } from 'vitest';
import {
  createAssistantAudioPlayback,
  type AssistantAudioPlayback,
  type AssistantAudioPlaybackObserver,
} from './assistantAudioPlayback';
import type { VoicePlaybackDiagnostics, VoicePlaybackState } from './types';

type FakeAudioBuffer = {
  getChannelData: ReturnType<typeof vi.fn>;
  duration: number;
};

type FakeAudioBufferSourceNode = {
  buffer: FakeAudioBuffer | null;
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
};

type FakeAudioContext = {
  currentTime: number;
  destination: { kind: 'destination' };
  createBuffer: ReturnType<typeof vi.fn>;
  createBufferSource: ReturnType<typeof vi.fn>;
  createMediaStreamDestination: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type PlaybackHarness = {
  playback: AssistantAudioPlayback;
  observer: AssistantAudioPlaybackObserver;
  stateChanges: VoicePlaybackState[];
  diagnostics: Partial<VoicePlaybackDiagnostics>[];
  errors: string[];
  context: FakeAudioContext;
  sources: FakeAudioBufferSourceNode[];
  audioElement: {
    autoplay: boolean;
    muted: boolean;
    srcObject: MediaStream | null;
    play: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    removeAttribute: ReturnType<typeof vi.fn>;
    setSinkId?: ReturnType<typeof vi.fn>;
  };
  completeSource: (index: number) => void;
};

function createPlaybackHarness({
  selectedOutputDeviceId = 'default',
  setSinkId = true,
  failSinkId = false,
}: {
  selectedOutputDeviceId?: string;
  setSinkId?: boolean;
  failSinkId?: boolean;
} = {}): PlaybackHarness {
  const stateChanges: VoicePlaybackState[] = [];
  const diagnostics: Partial<VoicePlaybackDiagnostics>[] = [];
  const errors: string[] = [];
  const sources: FakeAudioBufferSourceNode[] = [];
  const destination = { kind: 'destination' } as const;
  const mediaDestination = {
    stream: {} as MediaStream,
  };

  const context: FakeAudioContext = {
    currentTime: 0,
    destination,
    createBuffer: vi.fn((_channels: number, frames: number, sampleRate: number) => {
      const channelData = new Float32Array(frames);

      return {
        duration: frames / sampleRate,
        getChannelData: vi.fn(() => channelData),
      };
    }),
    createBufferSource: vi.fn(() => {
      const source: FakeAudioBufferSourceNode = {
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn((when?: number) => {
          context.currentTime = Math.max(context.currentTime, when ?? 0);
        }),
        stop: vi.fn(),
        onended: null,
      };
      sources.push(source);
      return source;
    }),
    createMediaStreamDestination: vi.fn(() => mediaDestination),
    close: vi.fn(async () => undefined),
  };

  const audioElement = {
    autoplay: false,
    muted: false,
    srcObject: null as MediaStream | null,
    play: vi.fn(async () => undefined),
    pause: vi.fn(),
    removeAttribute: vi.fn(),
    ...(setSinkId
      ? {
          setSinkId: vi.fn(async () => {
            if (failSinkId) {
              throw new Error('sink rejected');
            }
          }),
        }
      : {}),
  };

  const observer: AssistantAudioPlaybackObserver = {
    onStateChange: (state) => {
      stateChanges.push(state);
    },
    onDiagnostics: (patch) => {
      diagnostics.push(patch);
    },
    onError: (detail) => {
      errors.push(detail);
    },
  };

  return {
    playback: createAssistantAudioPlayback(observer, {
      selectedOutputDeviceId,
      createAudioContext: () => context,
      createAudioElement: () => audioElement,
    }),
    observer,
    stateChanges,
    diagnostics,
    errors,
    context,
    sources,
    audioElement,
    completeSource: (index) => {
      sources[index]?.onended?.();
    },
  };
}

describe('createAssistantAudioPlayback', () => {
  it('queues PCM chunks in order and transitions to stopped after playback drains', async () => {
    const harness = createPlaybackHarness();

    await harness.playback.enqueue(new Uint8Array([0, 0, 1, 0]));
    await harness.playback.enqueue(new Uint8Array([2, 0, 3, 0]));

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[0]?.start).toHaveBeenCalledWith(0);
    expect(harness.sources[1]?.start).toHaveBeenCalledWith(2 / 24_000);
    expect(harness.stateChanges).toEqual(
      expect.arrayContaining(['buffering', 'playing']),
    );

    harness.completeSource(0);
    harness.completeSource(1);

    expect(harness.stateChanges.at(-1)).toBe('stopped');
    expect(harness.diagnostics.at(-1)).toEqual(
      expect.objectContaining({
        chunkCount: 2,
        queueDepth: 0,
      }),
    );
  });

  it('stops active playback, clears queued work, and closes audio resources', async () => {
    const harness = createPlaybackHarness({
      selectedOutputDeviceId: 'desk-speakers',
    });

    await harness.playback.enqueue(new Uint8Array([0, 0, 1, 0]));
    await harness.playback.stop();

    expect(harness.audioElement.setSinkId).toHaveBeenCalledWith('desk-speakers');
    expect(harness.sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(harness.context.close).toHaveBeenCalledTimes(1);
    expect(harness.stateChanges).toEqual(
      expect.arrayContaining(['stopping', 'stopped']),
    );
  });

  it('stops every scheduled source and remains safe when stop is called again', async () => {
    const harness = createPlaybackHarness();

    await harness.playback.enqueue(new Uint8Array([0, 0, 1, 0]));
    await harness.playback.enqueue(new Uint8Array([2, 0, 3, 0]));

    await harness.playback.stop();
    await expect(harness.playback.stop()).resolves.toBeUndefined();

    expect(harness.sources).toHaveLength(2);
    expect(harness.sources[0]?.stop).toHaveBeenCalledTimes(1);
    expect(harness.sources[1]?.stop).toHaveBeenCalledTimes(1);
    expect(harness.context.close).toHaveBeenCalledTimes(1);
    expect(harness.stateChanges.at(-1)).toBe('stopped');
    expect(harness.diagnostics.at(-1)).toEqual(
      expect.objectContaining({
        queueDepth: 0,
      }),
    );
  });

  it('falls back to the default output device when sink routing is unavailable or rejected', async () => {
    const unsupportedHarness = createPlaybackHarness({
      selectedOutputDeviceId: 'desk-speakers',
      setSinkId: false,
    });

    await unsupportedHarness.playback.enqueue(new Uint8Array([0, 0, 1, 0]));

    expect(unsupportedHarness.context.createMediaStreamDestination).not.toHaveBeenCalled();
    expect(unsupportedHarness.diagnostics.at(-1)).toEqual(
      expect.objectContaining({
        selectedOutputDeviceId: 'default',
      }),
    );

    const rejectedHarness = createPlaybackHarness({
      selectedOutputDeviceId: 'desk-speakers',
      failSinkId: true,
    });

    await rejectedHarness.playback.enqueue(new Uint8Array([0, 0, 1, 0]));

    expect(rejectedHarness.audioElement.setSinkId).toHaveBeenCalledWith('desk-speakers');
    expect(rejectedHarness.diagnostics.at(-1)).toEqual(
      expect.objectContaining({
        selectedOutputDeviceId: 'default',
      }),
    );
  });

  it('rejects malformed PCM chunks, clears playback, and surfaces an error', async () => {
    const harness = createPlaybackHarness();

    await expect(harness.playback.enqueue(new Uint8Array([1]))).rejects.toThrow(
      'Assistant audio chunk was malformed',
    );

    expect(harness.errors).toEqual(['Assistant audio chunk was malformed']);
    expect(harness.stateChanges.at(-1)).toBe('error');
    expect(harness.context.close).toHaveBeenCalledTimes(1);
  });
});
