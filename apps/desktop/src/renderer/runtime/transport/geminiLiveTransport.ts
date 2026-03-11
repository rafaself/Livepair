import type {
  DesktopSession,
  DesktopSessionConnectParams,
  LiveSessionEvent,
} from './transport.types';
import type { VoiceToolResponse } from '../voice/voice.types';
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
import {
  buildGeminiLiveAudioInput,
  buildGeminiLiveAudioStreamEnd,
  buildGeminiLiveSdkToolResponse,
  buildGeminiLiveTextTurn,
  buildGeminiLiveVideoInput,
} from './geminiLiveTransportOutbound';
import { handleGeminiLiveSdkMessage } from './geminiLiveTransportInbound';
import {
  handleGeminiLiveSdkClose,
  handleGeminiLiveSdkError,
  handleGeminiLiveUnexpectedTermination,
} from './geminiLiveTransportLifecycle';
import {
  closeGeminiLiveSdkSession,
  createTransportError,
  getErrorDetail,
} from './geminiLiveTransportProtocol';
import {
  createGeminiLiveTransportState,
  resetGeminiLiveTransportState,
} from './geminiLiveTransportState';
import { logRuntimeDiagnostic, logRuntimeError } from '../core/logger';

export type CreateGeminiLiveTransportOptions = {
  connectSession?: (
    options: ConnectGeminiLiveSdkSessionOptions,
  ) => Promise<GeminiLiveSdkSession>;
  config?: LiveConfig;
};

export class GeminiLiveTransport implements DesktopSession {
  kind = LIVE_ADAPTER_KEY;

  private readonly listeners = new Set<(event: LiveSessionEvent) => void>();
  private readonly connectSession: (
    options: ConnectGeminiLiveSdkSessionOptions,
  ) => Promise<GeminiLiveSdkSession>;
  private readonly config: LiveConfig;
  private readonly state = createGeminiLiveTransportState();

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

  async connect({ token, mode, resumeHandle }: DesktopSessionConnectParams): Promise<void> {
    if (!token.token) {
      const detail = 'Gemini Live token was missing';
      this.emit({ type: 'error', detail });
      throw createTransportError(detail);
    }

    if (this.state.session) {
      await this.disconnect();
    }

    resetGeminiLiveTransportState(this.state, {
      hasReceivedGoAway: false,
      closingByClient: false,
      disconnectResolver: null,
    });
    this.state.activeMode = mode;
    this.emit({ type: 'connection-state-changed', state: 'connecting' });
    logRuntimeDiagnostic('gemini-live-transport', 'connect started', {
      mode,
      apiVersion: this.config.apiVersion,
      model: this.config.model,
      expireTime: token.expireTime,
      newSessionExpireTime: token.newSessionExpireTime,
    });

    let liveConnectConfig: GeminiLiveConnectConfig;

    try {
      liveConnectConfig = buildGeminiLiveConnectConfig(this.config, mode, {
        resumeHandle,
      });
    } catch (error) {
      const detail = getErrorDetail(error, 'Gemini Live connection failed');
      logRuntimeError('gemini-live-transport', 'connect config rejected', {
        detail,
        mode,
        apiVersion: this.config.apiVersion,
        model: this.config.model,
      });
      this.emit({ type: 'error', detail });
      throw createTransportError(detail);
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
        resetGeminiLiveTransportState(this.state);
        this.emit({ type: 'error', detail });
        reject(createTransportError(detail));
      };

      const rejectSetup = (detail: string): void => {
        if (isSetupSettled) {
          return;
        }

        isSetupSettled = true;
        resetGeminiLiveTransportState(this.state);
        reject(createTransportError(detail));
      };

      const handleUnexpectedTermination = (detail: string): void => {
        handleGeminiLiveUnexpectedTermination(
          this.state,
          (event) => {
            this.emit(event);
          },
          (message, metadata) => {
            logRuntimeDiagnostic('gemini-live-transport', message, metadata);
          },
          detail,
        );
      };

      const handleSdkMessage = (message: GeminiLiveSdkServerMessage): void => {
        handleGeminiLiveSdkMessage(
          {
            state: this.state,
            apiVersion: this.config.apiVersion,
            model: this.config.model,
            emit: (event) => {
              this.emit(event);
            },
            logDiagnostic: (message, metadata) => {
              logRuntimeDiagnostic('gemini-live-transport', message, metadata);
            },
            resolveSetup,
            rejectSetup,
          },
          message,
        );
      };

      const handleSdkError = (event: ErrorEvent): void => {
        handleGeminiLiveSdkError(
          {
            state: this.state,
            failSetup,
            handleUnexpectedTermination,
            logError: (message, metadata) => {
              logRuntimeError('gemini-live-transport', message, metadata);
            },
          },
          event,
        );
      };

      const handleSdkClose = (event: CloseEvent): void => {
        handleGeminiLiveSdkClose(
          {
            state: this.state,
            failSetup,
            handleUnexpectedTermination,
            logDiagnostic: (message, metadata) => {
              logRuntimeDiagnostic('gemini-live-transport', message, metadata);
            },
          },
          event,
        );
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
          this.state.session = session;
          logRuntimeDiagnostic('gemini-live-transport', 'sdk connect resolved');
        })
        .catch((error: unknown) => {
          logRuntimeError('gemini-live-transport', 'sdk connect rejected', {
            detail: getErrorDetail(error, 'Gemini Live connection failed'),
          });
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
    const session = this.state.session;

    if (!session || !this.state.hasCompletedSetup) {
      throw createTransportError('Gemini Live session is not connected');
    }

    if (this.state.pendingOutputText.length > 0) {
      this.state.pendingOutputText = '';
      this.emit({ type: 'interrupted' });
    }

    logRuntimeDiagnostic('gemini-live-transport', 'send text', {
      textLength: text.length,
    });
    session.sendClientContent(buildGeminiLiveTextTurn(text));
  }

  async sendAudioChunk(_chunk: Uint8Array): Promise<void> {
    const session = this.state.session;

    if (!session || !this.state.hasCompletedSetup) {
      throw createTransportError('Gemini Live session is not connected');
    }

    if (this.state.activeMode !== 'voice') {
      throw createTransportError('Gemini Live audio input requires a voice session');
    }

    this.state.hasOpenAudioStream = true;
    session.sendRealtimeInput(buildGeminiLiveAudioInput(_chunk));
  }

  async sendVideoFrame(data: Uint8Array, mimeType: string): Promise<void> {
    const session = this.state.session;

    if (!session || !this.state.hasCompletedSetup) {
      throw createTransportError('Gemini Live session is not connected');
    }

    if (this.state.activeMode !== 'voice') {
      throw createTransportError('Gemini Live video input requires a voice session');
    }

    logRuntimeDiagnostic('gemini-live-transport', 'send video frame', {
      byteLength: data.byteLength,
      mimeType,
    });
    session.sendRealtimeInput(buildGeminiLiveVideoInput(data, mimeType));
  }

  async sendAudioStreamEnd(): Promise<void> {
    const session = this.state.session;

    if (!session || !this.state.hasCompletedSetup || this.state.activeMode !== 'voice') {
      return;
    }

    if (!this.state.hasOpenAudioStream) {
      return;
    }

    this.state.hasOpenAudioStream = false;
    session.sendRealtimeInput(buildGeminiLiveAudioStreamEnd());
  }

  async sendToolResponses(responses: VoiceToolResponse[]): Promise<void> {
    const session = this.state.session;

    if (!session || !this.state.hasCompletedSetup) {
      throw createTransportError('Gemini Live session is not connected');
    }

    if (responses.length === 0) {
      return;
    }

    session.sendToolResponse(buildGeminiLiveSdkToolResponse(responses));
  }

  async disconnect(): Promise<void> {
    const session = this.state.session;

    if (!session) {
      this.state.activeMode = null;
      this.state.hasOpenAudioStream = false;
      this.emit({ type: 'connection-state-changed', state: 'disconnected' });
      return;
    }

    this.state.closingByClient = true;
    logRuntimeDiagnostic('gemini-live-transport', 'disconnect requested');

    await new Promise<void>((resolve) => {
      this.state.disconnectResolver = () => {
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
