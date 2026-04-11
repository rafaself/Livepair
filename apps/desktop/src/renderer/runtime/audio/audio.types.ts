import type {
  LocalVoiceChunk,
  VoiceCaptureDiagnostics,
  VoicePlaybackDiagnostics,
  VoicePlaybackState,
} from '../voice/voice.types';

export type AudioInputEvent =
  | { type: 'capture.chunk'; chunk: LocalVoiceChunk }
  | { type: 'capture.activity'; active: boolean }
  | { type: 'capture.diagnostics'; diagnostics: Partial<VoiceCaptureDiagnostics> }
  | { type: 'capture.error'; detail: string };

export type AudioInputObserver = {
  onEvent: (event: AudioInputEvent) => void;
};

export type AudioOutputEvent =
  | { type: 'playback.state'; state: VoicePlaybackState }
  | { type: 'playback.diagnostics'; diagnostics: Partial<VoicePlaybackDiagnostics> }
  | { type: 'playback.error'; detail: string };

export type AudioOutputObserver = {
  onEvent: (event: AudioOutputEvent) => void;
};

export type AssistantAudioPlayback = {
  enqueue: (chunk: Uint8Array) => Promise<void>;
  stop: () => Promise<void>;
};
