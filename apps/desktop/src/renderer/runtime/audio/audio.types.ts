export type AssistantAudioPlayback = {
  enqueue: (chunk: Uint8Array) => Promise<void>;
  stop: () => Promise<void>;
};
