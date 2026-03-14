import type { VoicePlaybackDiagnostics } from '../voice/voice.types';

const DEFAULT_OUTPUT_DEVICE_ID = 'default';

type AudioBufferLike = {
  duration: number;
  getChannelData: (channel: number) => Float32Array;
};

type AudioBufferSourceNodeLike = {
  buffer: AudioBufferLike | null;
  connect: (destination: unknown) => unknown;
  disconnect: () => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
  onended: (() => void) | null;
};

type MediaStreamDestinationLike = {
  stream: MediaStream;
};

type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  createBuffer: (
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ) => AudioBufferLike;
  createBufferSource: () => AudioBufferSourceNodeLike;
  createMediaStreamDestination?: () => MediaStreamDestinationLike;
  close: () => Promise<void>;
};

type AudioElementLike = {
  autoplay: boolean;
  muted: boolean;
  srcObject: MediaStream | null;
  play: () => Promise<void>;
  pause: () => void;
  removeAttribute: (qualifiedName: string) => void;
  setSinkId?: (sinkId: string) => Promise<void>;
};

type CreateAssistantAudioPlaybackOutputRouteOptions = {
  selectedOutputDeviceId: string;
  createAudioContext: () => AudioContextLike;
  createAudioElement: () => AudioElementLike;
  emitDiagnostics: (patch: Partial<VoicePlaybackDiagnostics>) => void;
};

export function createAssistantAudioPlaybackOutputRoute({
  selectedOutputDeviceId,
  createAudioContext,
  createAudioElement,
  emitDiagnostics,
}: CreateAssistantAudioPlaybackOutputRouteOptions) {
  let audioContext: AudioContextLike | null = null;
  let playbackDestination: unknown = null;
  let audioElement: AudioElementLike | null = null;
  let effectiveOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID;

  const cleanup = async (): Promise<void> => {
    if (audioElement) {
      audioElement.pause();
      audioElement.srcObject = null;
      audioElement.removeAttribute('src');
      audioElement = null;
    }

    if (audioContext) {
      const context = audioContext;
      audioContext = null;
      playbackDestination = null;
      await context.close();
    }
  };

  const ensureOutputRoute = async (): Promise<void> => {
    if (audioContext && playbackDestination) {
      return;
    }

    const context = createAudioContext();
    audioContext = context;
    playbackDestination = context.destination;
    effectiveOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID;

    if (
      selectedOutputDeviceId === DEFAULT_OUTPUT_DEVICE_ID ||
      typeof context.createMediaStreamDestination !== 'function'
    ) {
      emitDiagnostics({});
      return;
    }

    const element = createAudioElement();

    if (typeof element.setSinkId !== 'function') {
      emitDiagnostics({});
      return;
    }

    try {
      const mediaDestination = context.createMediaStreamDestination();
      element.autoplay = true;
      element.muted = false;
      element.srcObject = mediaDestination.stream;
      await element.setSinkId(selectedOutputDeviceId);
      await element.play();
      audioElement = element;
      playbackDestination = mediaDestination;
      effectiveOutputDeviceId = selectedOutputDeviceId;
    } catch {
      element.pause();
      element.srcObject = null;
      element.removeAttribute('src');
      playbackDestination = context.destination;
      effectiveOutputDeviceId = DEFAULT_OUTPUT_DEVICE_ID;
    }

    emitDiagnostics({});
  };

  return {
    cleanup,
    ensureOutputRoute,
    getAudioContext: (): AudioContextLike | null => audioContext,
    getEffectiveOutputDeviceId: (): string => effectiveOutputDeviceId,
    getPlaybackDestination: (): unknown | null => playbackDestination,
  };
}
