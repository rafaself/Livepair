import type {
  DesktopSessionTransport,
  DesktopSessionTransportConnectParams,
  ConversationTurnModel,
  TransportEvent,
} from './types';
import { formatConversationTimestamp } from './conversationTimestamp';

const GEMINI_LIVE_MODEL =
  'models/gemini-2.5-flash-native-audio-preview-12-2025';
const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained';

type GeminiSetupCompleteMessage = {
  setupComplete: Record<string, never>;
};

type GeminiGoAwayMessage = {
  goAway: {
    reason?: string | undefined;
  };
};

type GeminiTextPart = {
  text?: string | undefined;
};

type GeminiServerContentMessage = {
  serverContent: {
    modelTurn?: {
      parts?: GeminiTextPart[] | undefined;
    } | undefined;
    interrupted?: boolean | undefined;
    turnComplete?: boolean | undefined;
  };
};

type GeminiServerMessage =
  | GeminiSetupCompleteMessage
  | GeminiGoAwayMessage
  | GeminiServerContentMessage;

export type CreateGeminiLiveTransportOptions = {
  createWebSocket?: (url: string) => WebSocket;
  model?: string;
  url?: string;
};

function isGeminiServerMessage(value: unknown): value is GeminiServerMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  return 'setupComplete' in value || 'goAway' in value || 'serverContent' in value;
}

function createSessionUrl(url: string, accessToken: string): string {
  const sessionUrl = new URL(url);
  sessionUrl.searchParams.set('access_token', accessToken);
  return sessionUrl.toString();
}

function createError(detail: string): Error {
  return new Error(detail);
}

function extractTextContent(parts?: GeminiTextPart[] | undefined): string {
  if (!parts) {
    return '';
  }

  return parts
    .map((part) => part.text ?? '')
    .filter((text) => text.length > 0)
    .join('');
}

export class GeminiLiveTransport implements DesktopSessionTransport {
  kind = 'gemini-live' as const;

  private readonly listeners = new Set<(event: TransportEvent) => void>();
  private readonly createWebSocket: (url: string) => WebSocket;
  private readonly model: string;
  private readonly url: string;

  private socket: WebSocket | null = null;
  private unsubscribeSocket: (() => void) | null = null;
  private hasCompletedSetup = false;
  private closingByClient = false;
  private nextAssistantTurnNumber = 0;
  private pendingAssistantTurn: ConversationTurnModel | null = null;

  constructor({
    createWebSocket = (url) => new WebSocket(url),
    model = GEMINI_LIVE_MODEL,
    url = GEMINI_LIVE_URL,
  }: CreateGeminiLiveTransportOptions = {}) {
    this.createWebSocket = createWebSocket;
    this.model = model;
    this.url = url;
  }

  subscribe(listener: (event: TransportEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect({ token }: DesktopSessionTransportConnectParams): Promise<void> {
    if (!token.token) {
      const detail = 'Gemini Live token was missing';
      this.emit({ type: 'transport.lifecycle', state: 'error', detail });
      throw createError(detail);
    }

    if (this.socket) {
      await this.disconnect();
    }

    this.hasCompletedSetup = false;
    this.closingByClient = false;
    this.emit({ type: 'transport.lifecycle', state: 'connecting' });

    const socket = this.createWebSocket(createSessionUrl(this.url, token.token));
    this.socket = socket;

    await new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        this.unsubscribeSocket?.();
        this.unsubscribeSocket = null;
      };

      const fail = (detail: string): void => {
        if (this.socket === socket) {
          this.socket = null;
        }

        cleanup();
        this.emit({ type: 'transport.lifecycle', state: 'error', detail });
        reject(createError(detail));
      };

      const handleOpen = (): void => {
        socket.send(
          JSON.stringify({
            setup: {
              model: this.model,
              generationConfig: {
                responseModalities: ['TEXT'],
              },
            },
          }),
        );
      };

      const handleMessage = (event: MessageEvent<string>): void => {
        let payload: unknown;

        try {
          payload = JSON.parse(event.data);
        } catch {
          return;
        }

        if (!isGeminiServerMessage(payload)) {
          return;
        }

        if ('setupComplete' in payload) {
          this.hasCompletedSetup = true;
          cleanup();
          this.unsubscribeSocket = this.attachSocketLifecycle(socket);
          this.emit({ type: 'transport.lifecycle', state: 'connected' });
          resolve();
          return;
        }

        if ('goAway' in payload) {
          fail(payload.goAway.reason ?? 'Gemini Live session was rejected');
        }
      };

      const handleError = (): void => {
        if (this.hasCompletedSetup) {
          return;
        }

        fail('Gemini Live connection failed');
      };

      const handleClose = (event: CloseEvent): void => {
        if (this.closingByClient) {
          cleanup();
          this.socket = null;
          this.closingByClient = false;
          resolve();
          return;
        }

        fail(event.reason || 'Gemini Live session closed before setup completed');
      };

      socket.addEventListener('open', handleOpen);
      socket.addEventListener('message', handleMessage);
      socket.addEventListener('error', handleError);
      socket.addEventListener('close', handleClose);

      this.unsubscribeSocket = () => {
        socket.removeEventListener('open', handleOpen);
        socket.removeEventListener('message', handleMessage);
        socket.removeEventListener('error', handleError);
        socket.removeEventListener('close', handleClose);
      };
    });
  }

  async sendText(text: string): Promise<void> {
    const socket = this.socket;

    if (!socket || !this.hasCompletedSetup || socket.readyState !== WebSocket.OPEN) {
      throw createError('Gemini Live session is not connected');
    }

    if (this.pendingAssistantTurn) {
      this.emit({
        type: 'conversation.turn.updated',
        turnId: this.pendingAssistantTurn.id,
        content: this.pendingAssistantTurn.content,
        state: 'complete',
        statusLabel: 'Interrupted',
      });
      this.pendingAssistantTurn = null;
      this.emit({ type: 'assistant.activity', activity: 'ready' });
    }

    socket.send(
      JSON.stringify({
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text }],
            },
          ],
          turnComplete: true,
        },
      }),
    );
  }

  async disconnect(): Promise<void> {
    const socket = this.socket;

    if (!socket) {
      this.emit({ type: 'transport.lifecycle', state: 'disconnected' });
      return;
    }

    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      this.cleanupSocket();
      this.emit({ type: 'transport.lifecycle', state: 'disconnected' });
      return;
    }

    this.closingByClient = true;

    await new Promise<void>((resolve) => {
      const handleClose = (): void => {
        socket.removeEventListener('close', handleClose);
        this.cleanupSocket();
        this.closingByClient = false;
        this.emit({ type: 'transport.lifecycle', state: 'disconnected' });
        resolve();
      };

      socket.addEventListener('close', handleClose);
      socket.close(1000, 'Client ended session');
    });
  }

  private attachSocketLifecycle(socket: WebSocket): () => void {
    const handleMessage = (event: MessageEvent<string>): void => {
      let payload: unknown;

      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }

      if (!isGeminiServerMessage(payload)) {
        return;
      }

      if ('goAway' in payload) {
        const detail = payload.goAway.reason ?? 'Gemini Live session was rejected';
        this.markPendingAssistantTurnAsFailed('Disconnected');
        this.cleanupSocket();
        this.emit({
          type: 'transport.lifecycle',
          state: 'error',
          detail,
        });
        return;
      }

      if (!('serverContent' in payload)) {
        return;
      }

      const textChunk = extractTextContent(payload.serverContent.modelTurn?.parts);

      if (textChunk.length > 0) {
        if (!this.pendingAssistantTurn) {
          const turn: ConversationTurnModel = {
            id: `assistant-turn-${++this.nextAssistantTurnNumber}`,
            role: 'assistant',
            content: textChunk,
            timestamp: formatConversationTimestamp(),
            state: 'streaming',
            statusLabel: 'Responding...',
          };

          this.pendingAssistantTurn = turn;
          this.emit({ type: 'conversation.turn.appended', turn });
        } else {
          this.pendingAssistantTurn = {
            ...this.pendingAssistantTurn,
            content: `${this.pendingAssistantTurn.content}${textChunk}`,
            state: 'streaming',
            statusLabel: 'Responding...',
          };

          this.emit({
            type: 'conversation.turn.updated',
            turnId: this.pendingAssistantTurn.id,
            content: this.pendingAssistantTurn.content,
            state: 'streaming',
            statusLabel: 'Responding...',
          });
        }
      }

      if (payload.serverContent.interrupted) {
        this.finalizePendingAssistantTurn('Interrupted');
        return;
      }

      if (payload.serverContent.turnComplete) {
        this.finalizePendingAssistantTurn();
      }
    };

    const handleClose = (event: CloseEvent): void => {
      if (this.closingByClient) {
        return;
      }

      const detail = event.reason || 'Gemini Live session closed unexpectedly';
      this.markPendingAssistantTurnAsFailed('Disconnected');
      this.cleanupSocket();
      this.emit({ type: 'transport.lifecycle', state: 'error', detail });
    };

    const handleError = (): void => {
      if (this.closingByClient) {
        return;
      }

      if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
        return;
      }

      this.markPendingAssistantTurnAsFailed('Disconnected');
      this.cleanupSocket();
      this.emit({
        type: 'transport.lifecycle',
        state: 'error',
        detail: 'Gemini Live connection failed',
      });
    };

    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', handleClose);
    socket.addEventListener('error', handleError);

    return () => {
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', handleClose);
      socket.removeEventListener('error', handleError);
    };
  }

  private cleanupSocket(): void {
    this.unsubscribeSocket?.();
    this.unsubscribeSocket = null;
    this.socket = null;
    this.hasCompletedSetup = false;
    this.pendingAssistantTurn = null;
  }

  private emit(event: TransportEvent): void {
    this.listeners.forEach((listener) => {
      listener(event);
    });
  }

  private finalizePendingAssistantTurn(statusLabel?: string): void {
    if (!this.pendingAssistantTurn) {
      this.emit({ type: 'assistant.activity', activity: 'ready' });
      return;
    }

    this.emit({
      type: 'conversation.turn.updated',
      turnId: this.pendingAssistantTurn.id,
      content: this.pendingAssistantTurn.content,
      state: 'complete',
      statusLabel,
    });
    this.pendingAssistantTurn = null;
    this.emit({ type: 'assistant.activity', activity: 'ready' });
  }

  private markPendingAssistantTurnAsFailed(statusLabel: string): void {
    if (!this.pendingAssistantTurn) {
      return;
    }

    this.emit({
      type: 'conversation.turn.updated',
      turnId: this.pendingAssistantTurn.id,
      content: this.pendingAssistantTurn.content,
      state: 'error',
      statusLabel,
    });
    this.pendingAssistantTurn = null;
  }
}

export function createGeminiLiveTransport(
  options?: CreateGeminiLiveTransportOptions,
): DesktopSessionTransport {
  return new GeminiLiveTransport(options);
}
