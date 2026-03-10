import {
  GoogleGenAI,
  Modality,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Session,
} from '@google/genai';
import type {
  GeminiLiveConnectConfig,
  LiveApiVersion,
} from './liveConfig';

export type GeminiLiveSdkServerMessage = {
  setupComplete?: LiveServerMessage['setupComplete'] | undefined;
  serverContent?: LiveServerMessage['serverContent'] | undefined;
  goAway?:
    | (NonNullable<LiveServerMessage['goAway']> & {
        reason?: string | undefined;
      })
    | undefined;
  sessionResumptionUpdate?: LiveServerMessage['sessionResumptionUpdate'] | undefined;
  text?: string | undefined;
};

export type GeminiLiveSdkCallbacks = {
  onOpen?: (() => void) | undefined;
  onMessage: (message: GeminiLiveSdkServerMessage) => void;
  onError?: ((event: ErrorEvent) => void) | undefined;
  onClose?: ((event: CloseEvent) => void) | undefined;
};

export type GeminiLiveSdkSession = Pick<Session, 'sendClientContent' | 'close'>;

export type ConnectGeminiLiveSdkSessionOptions = {
  apiKey: string;
  apiVersion: LiveApiVersion;
  model: string;
  config: GeminiLiveConnectConfig;
  callbacks: GeminiLiveSdkCallbacks;
};

function toSdkModality(modality: GeminiLiveConnectConfig['responseModalities'][number]): Modality {
  return modality === 'TEXT' ? Modality.TEXT : Modality.AUDIO;
}

let testConnector:
  | ((options: ConnectGeminiLiveSdkSessionOptions) => Promise<GeminiLiveSdkSession>)
  | null = null;

export function setGeminiLiveSdkSessionConnectorForTests(
  connector:
    | ((options: ConnectGeminiLiveSdkSessionOptions) => Promise<GeminiLiveSdkSession>)
    | null,
): void {
  testConnector = connector;
}

export async function connectGeminiLiveSdkSession({
  apiKey,
  apiVersion,
  model,
  config,
  callbacks,
}: ConnectGeminiLiveSdkSessionOptions): Promise<GeminiLiveSdkSession> {
  if (testConnector) {
    return testConnector({
      apiKey,
      apiVersion,
      model,
      config,
      callbacks,
    });
  }

  console.info('[runtime:gemini-live-sdk] connecting', {
    model,
    apiVersion,
    responseModalities: config.responseModalities,
    tokenLength: apiKey.length,
  });

  const ai = new GoogleGenAI({
    apiKey,
    apiVersion,
  });

  const liveConnectConfig: LiveConnectConfig = {
    responseModalities: config.responseModalities.map(toSdkModality),
  };

  if (config.inputAudioTranscription) {
    liveConnectConfig.inputAudioTranscription = config.inputAudioTranscription;
  }

  if (config.outputAudioTranscription) {
    liveConnectConfig.outputAudioTranscription = config.outputAudioTranscription;
  }

  if (config.mediaResolution) {
    liveConnectConfig.mediaResolution =
      config.mediaResolution as NonNullable<LiveConnectConfig['mediaResolution']>;
  }

  if (config.sessionResumption) {
    liveConnectConfig.sessionResumption = config.sessionResumption;
  }

  if (config.contextWindowCompression) {
    liveConnectConfig.contextWindowCompression = config.contextWindowCompression;
  }

  return ai.live.connect({
    model,
    config: liveConnectConfig,
    callbacks: {
      onopen: callbacks.onOpen ?? null,
      onmessage: (message) => {
        const normalizedMessage: GeminiLiveSdkServerMessage = {};

        if (message.setupComplete) {
          normalizedMessage.setupComplete = message.setupComplete;
        }

        if (message.serverContent) {
          normalizedMessage.serverContent = message.serverContent;
        }

        if (message.goAway) {
          normalizedMessage.goAway = message.goAway;
        }

        if (message.sessionResumptionUpdate) {
          normalizedMessage.sessionResumptionUpdate = message.sessionResumptionUpdate;
        }

        if (message.text !== undefined) {
          normalizedMessage.text = message.text;
        }

        callbacks.onMessage(normalizedMessage);
      },
      onerror: callbacks.onError ?? null,
      onclose: callbacks.onClose ?? null,
    },
  });
}
