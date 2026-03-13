import { buildGeminiLiveSdkToolResponse } from './geminiLiveSdkClient';
import { encodeChunkToBase64 } from './geminiLiveTransportProtocol';
import type { LiveSessionHistoryTurn } from './transport.types';

export const LIVE_AUDIO_PCM_MIME_TYPE = 'audio/pcm;rate=16000';

export function buildGeminiLiveTextTurn(text: string): {
  turns: [{ role: 'user'; parts: [{ text: string }] }];
  turnComplete: true;
} {
  return {
    turns: [
      {
        role: 'user',
        parts: [{ text }],
      },
    ],
    turnComplete: true,
  };
}

export function buildGeminiLiveHistoryPrefill(
  history: LiveSessionHistoryTurn[],
): {
  turns: LiveSessionHistoryTurn[];
} {
  return {
    turns: history,
  };
}

export function buildGeminiLiveAudioInput(chunk: Uint8Array): {
  audio: {
    data: string;
    mimeType: string;
  };
} {
  return {
    audio: {
      data: encodeChunkToBase64(chunk),
      mimeType: LIVE_AUDIO_PCM_MIME_TYPE,
    },
  };
}

export function buildGeminiLiveVideoInput(
  data: Uint8Array,
  mimeType: string,
): {
  video: {
    data: string;
    mimeType: string;
  };
} {
  return {
    video: {
      data: encodeChunkToBase64(data),
      mimeType,
    },
  };
}

export function buildGeminiLiveAudioStreamEnd(): {
  audioStreamEnd: true;
} {
  return {
    audioStreamEnd: true,
  };
}

export { buildGeminiLiveSdkToolResponse };
