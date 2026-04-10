import type {
  AnswerMetadata,
  CreateEphemeralTokenResponse,
  LiveTelemetryUsageReportedEvent,
  RehydrationPacket,
} from '@livepair/shared-types';
import type { VoiceToolCall, VoiceToolResponse } from '../voice/voice.types';
import type { LiveConnectMode } from '../core/session.types';

export type TransportKind = 'backend-text' | 'gemini-live';

export type TransportConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnecting'
  | 'error';

export type SessionConnectionState = 'connecting' | 'connected' | 'disconnected';

export type LiveSessionHistoryTurn = {
  role: 'user' | 'model';
  parts: Array<{
    text: string;
  }>;
};

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
      type: 'answer-metadata';
      answerMetadata: AnswerMetadata;
    }
  | {
      type: 'usage-metadata';
      usage: LiveTelemetryUsageReportedEvent['usage'];
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

type LiveTransportConnectRequestBase = {
  token: CreateEphemeralTokenResponse;
  mode: LiveConnectMode;
};

type LiveTransportFreshConnectRequest = LiveTransportConnectRequestBase & {
  resumeHandle?: undefined;
  rehydrationPacket?: undefined;
};

type LiveTransportResumeConnectRequest = LiveTransportConnectRequestBase & {
  resumeHandle: string;
  rehydrationPacket?: undefined;
};

type LiveTransportRehydrateConnectRequest = LiveTransportConnectRequestBase & {
  resumeHandle?: undefined;
  rehydrationPacket: RehydrationPacket;
};

export type LiveTransportConnectRequest =
  | LiveTransportFreshConnectRequest
  | LiveTransportResumeConnectRequest
  | LiveTransportRehydrateConnectRequest;

export type LiveTransportSubmitRequest =
  | {
      type: 'text';
      text: string;
    }
  | {
      type: 'audio-chunk';
      chunk: Uint8Array;
    }
  | {
      type: 'audio-stream-end';
    }
  | {
      type: 'tool-responses';
      responses: VoiceToolResponse[];
    }
  | {
      type: 'video-frame';
      data: Uint8Array;
      mimeType: string;
    };

export type LiveTransport = {
  kind: TransportKind;
  connect: (params: LiveTransportConnectRequest) => Promise<void>;
  submit: (request: LiveTransportSubmitRequest) => Promise<void>;
  disconnect: () => Promise<void>;
  subscribe: (listener: (event: LiveSessionEvent) => void) => () => void;
};

export type DesktopSessionConnectParams = LiveTransportConnectRequest;
export type DesktopSession = LiveTransport;
