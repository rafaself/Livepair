import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import type { VoiceToolCall, VoiceToolResponse } from '../voice/voice.types';
import type { SessionMode } from '../core/session.types';

export type TransportKind = 'backend-text' | 'gemini-live';

export type TransportConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type SessionConnectionState = 'connecting' | 'connected' | 'disconnected';

export type LiveSessionEvent =
  | {
      type: 'connection-state-changed';
      state: SessionConnectionState;
    }
  | {
      type: 'text-delta';
      text: string;
    }
  | {
      type: 'text-message';
      text: string;
    }
  | {
      type: 'audio-chunk';
      chunk: Uint8Array;
    }
  | {
      type: 'audio-error';
      detail: string;
    }
  | {
      type: 'input-transcript';
      text: string;
      isFinal?: boolean | undefined;
    }
  | {
      type: 'output-transcript';
      text: string;
      isFinal?: boolean | undefined;
    }
  | {
      type: 'interrupted';
    }
  | {
      type: 'generation-complete';
    }
  | {
      type: 'turn-complete';
    }
  | {
      type: 'go-away';
      detail?: string | undefined;
    }
  | {
      type: 'session-resumption-update';
      handle: string | null;
      resumable: boolean;
      detail?: string | undefined;
    }
  | {
      type: 'connection-terminated';
      detail?: string | undefined;
    }
  | {
      type: 'tool-call';
      calls: VoiceToolCall[];
    }
  | {
      type: 'error';
      detail: string;
    };

export type DesktopSessionConnectParams = {
  token: CreateEphemeralTokenResponse;
  mode: SessionMode;
  resumeHandle?: string | undefined;
};

export type DesktopSession = {
  kind: TransportKind;
  connect: (params: DesktopSessionConnectParams) => Promise<void>;
  sendText: (text: string) => Promise<void>;
  sendAudioChunk: (chunk: Uint8Array) => Promise<void>;
  sendAudioStreamEnd: () => Promise<void>;
  sendToolResponses: (responses: VoiceToolResponse[]) => Promise<void>;
  sendVideoFrame: (data: Uint8Array, mimeType: string) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: (event: LiveSessionEvent) => void) => () => void;
};
