import type {
  DesktopSession,
  DesktopSessionConnectParams,
  LiveSessionEvent,
} from './types';
import {
  LIVE_ADAPTER_KEY,
  buildGeminiLiveConnectConfig,
  getLiveConfig,
  type GeminiLiveConnectConfig,
  type LiveConfig,
} from './liveConfig';
import {
  connectGeminiLiveSdkSession,
  type ConnectGeminiLiveSdkSessionOptions,
  type GeminiLiveSdkServerMessage,
  type GeminiLiveSdkSession,
} from './geminiLiveSdkClient';

export type CreateGeminiLiveTransportOptions = {
  connectSession?: (
    options: ConnectGeminiLiveSdkSessionOptions,
  ) => Promise<GeminiLiveSdkSession>;
  config?: LiveConfig;
};

function createError(detail: string): Error {
  return new Error(detail);
}

function getErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

function getCloseReason(event: CloseEvent, fallback: string): string {
  return event.reason || fallback;
}

function getErrorEventDetail(event: ErrorEvent, fallback: string): string {
  if (event.message) {
    return event.message;
  }

  if (event.error instanceof Error && event.error.message.length > 0) {
    return event.error.message;
  }

  return fallback;
}

function getGoAwayDetail(message: GeminiLiveSdkServerMessage): string {
  const timeLeft = message.goAway?.timeLeft;

  if (message.goAway?.reason) {
    return message.goAway.reason;
  }

  if (timeLeft) {
    return `Gemini Live session is shutting down soon (${timeLeft} remaining)`;
  }

  return 'Gemini Live session was rejected';
}

function closeGeminiLiveSdkSession(session: GeminiLiveSdkSession | null): void {
  session?.close();
}

export class GeminiLiveTransport implements DesktopSession {
  kind = LIVE_ADAPTER_KEY;

  private readonly listeners = new Set<(event: LiveSessionEvent) => void>();
  private readonly connectSession: (
    options: ConnectGeminiLiveSdkSessionOptions,
  ) => Promise<GeminiLiveSdkSession>;
  private readonly config: LiveConfig;

  private session: GeminiLiveSdkSession | null = null;
  private hasCompletedSetup = false;
  private closingByClient = false;
  private pendingOutputText = '';
  private disconnectResolver: (() => void) | null = null;

  constructor({
    connectSession = connectGeminiLiveSdkSession,
    config = getLiveConfig(),
  }: CreateGeminiLiveTransportOptions = {}) {
    this.connectSession = connectSession;
    this.config = config;
  }

  subscribe(listener: (event: LiveSessionEvent) => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect({ token, mode }: DesktopSessionConnectParams): Promise<void> {
    if (!token.token) {
      const detail = 'Gemini Live token was missing';
      this.emit({ type: 'error', detail });
      throw createError(detail);
    }

    if (mode === 'voice') {
      const detail = 'Voice mode is not implemented for Gemini Live yet';
      this.emit({ type: 'error', detail });
      throw createError(detail);
    }

    if (this.session) {
      await this.disconnect();
    }

    this.hasCompletedSetup = false;
    this.closingByClient = false;
    this.pendingOutputText = '';
    this.emit({ type: 'connection-state-changed', state: 'connecting' });

    let liveConnectConfig: GeminiLiveConnectConfig;

    try {
      liveConnectConfig = buildGeminiLiveConnectConfig(this.config, mode);
    } catch (error) {
      const detail = getErrorDetail(error, 'Gemini Live connection failed');
      this.emit({ type: 'error', detail });
      throw createError(detail);
    }

    let isSetupSettled = false;
    let activeSession: GeminiLiveSdkSession | null = null;

    const setupPromise = new Promise<void>((resolve, reject) => {
      const resolveSetup = (): void => {
        if (isSetupSettled) {
          return;
        }

        isSetupSettled = true;
        resolve();
      };

      const failSetup = (detail: string): void => {
        if (isSetupSettled) {
          return;
        }

        isSetupSettled = true;
        this.session = null;
        this.hasCompletedSetup = false;
        this.pendingOutputText = '';
        this.emit({ type: 'error', detail });
        reject(createError(detail));
      };

      const handleUnexpectedTermination = (detail: string): void => {
        this.pendingOutputText = '';
        this.session = null;
        this.hasCompletedSetup = false;
        this.emit({ type: 'error', detail });
      };

      const handleSdkMessage = (message: GeminiLiveSdkServerMessage): void => {
        if (message.setupComplete) {
          this.hasCompletedSetup = true;
          this.emit({ type: 'connection-state-changed', state: 'connected' });
          resolveSetup();
          return;
        }

        if (message.goAway) {
          const detail = getGoAwayDetail(message);
          this.emit({ type: 'go-away', detail });

          if (!this.hasCompletedSetup) {
            failSetup(detail);
            return;
          }

          handleUnexpectedTermination(detail);
          return;
        }

        if (message.sessionResumptionUpdate) {
          this.emit({
            type: 'session-resumption-update',
            sessionId: message.sessionResumptionUpdate.newHandle,
            detail: message.sessionResumptionUpdate.resumable === false
              ? 'Gemini Live session is not resumable at this point'
              : undefined,
          });
        }

        const textChunk = message.text ?? '';

        if (textChunk.length > 0) {
          this.pendingOutputText = `${this.pendingOutputText}${textChunk}`;
          this.emit({ type: 'text-delta', text: textChunk });
        }

        if (message.serverContent?.interrupted) {
          this.pendingOutputText = '';
          this.emit({ type: 'interrupted' });
          return;
        }

        if (message.serverContent?.turnComplete) {
          if (this.pendingOutputText.length > 0) {
            this.emit({ type: 'text-message', text: this.pendingOutputText });
            this.pendingOutputText = '';
          }

          this.emit({ type: 'turn-complete' });
        }
      };

      const handleSdkError = (event: ErrorEvent): void => {
        const detail = getErrorEventDetail(event, 'Gemini Live connection failed');

        if (!this.hasCompletedSetup) {
          failSetup(detail);
          return;
        }

        if (this.closingByClient) {
          return;
        }

        handleUnexpectedTermination(detail);
      };

      const handleSdkClose = (event: CloseEvent): void => {
        const detail = getCloseReason(
          event,
          this.hasCompletedSetup
            ? 'Gemini Live session closed unexpectedly'
            : 'Gemini Live session closed before setup completed',
        );

        if (this.closingByClient) {
          this.session = null;
          this.hasCompletedSetup = false;
          this.pendingOutputText = '';
          this.closingByClient = false;
          this.disconnectResolver?.();
          this.disconnectResolver = null;
          return;
        }

        if (!this.hasCompletedSetup) {
          failSetup(detail);
          return;
        }

        handleUnexpectedTermination(detail);
      };

      void this.connectSession({
        apiKey: token.token,
        apiVersion: this.config.apiVersion,
        model: this.config.model,
        config: liveConnectConfig,
        callbacks: {
          onOpen: () => undefined,
          onMessage: handleSdkMessage,
          onError: handleSdkError,
          onClose: handleSdkClose,
        },
      })
        .then((session) => {
          activeSession = session;
          this.session = session;
        })
        .catch((error: unknown) => {
          failSetup(getErrorDetail(error, 'Gemini Live connection failed'));
        });
    });

    try {
      await setupPromise;
    } catch (error) {
      closeGeminiLiveSdkSession(activeSession);
      throw error;
    }
  }

  async sendText(text: string): Promise<void> {
    const session = this.session;

    if (!session || !this.hasCompletedSetup) {
      throw createError('Gemini Live session is not connected');
    }

    if (this.pendingOutputText.length > 0) {
      this.pendingOutputText = '';
      this.emit({ type: 'interrupted' });
    }

    session.sendClientContent({
      turns: [
        {
          role: 'user',
          parts: [{ text }],
        },
      ],
      turnComplete: true,
    });
  }

  async sendAudioChunk(_chunk: Uint8Array): Promise<void> {
    throw createError('Audio input is not implemented for Gemini Live yet');
  }

  async disconnect(): Promise<void> {
    const session = this.session;

    if (!session) {
      this.emit({ type: 'connection-state-changed', state: 'disconnected' });
      return;
    }

    this.closingByClient = true;

    await new Promise<void>((resolve) => {
      this.disconnectResolver = () => {
        this.emit({ type: 'connection-state-changed', state: 'disconnected' });
        resolve();
      };

      session.close();
    });
  }

  private emit(event: LiveSessionEvent): void {
    this.listeners.forEach((listener) => {
      listener(event);
    });
  }
}

export function createGeminiLiveTransport(
  options?: CreateGeminiLiveTransportOptions,
): DesktopSession {
  return new GeminiLiveTransport(options);
}
