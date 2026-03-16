import type { LiveSessionEvent } from './transport.types';
import type { LiveConnectMode } from '../core/session.types';
import type { GeminiLiveSdkServerMessage } from './geminiLiveSdkClient';
import type { GeminiLiveTransportState } from './geminiLiveTransportState';
import {
  decodeBase64Chunk,
  getGoAwayDetail,
  isAssistantAudioMimeType,
  normalizeToolCalls,
} from './geminiLiveTransportProtocol';
import { resetGeminiLiveTransportState } from './geminiLiveTransportState';
import { deriveAnswerMetadataFromGrounding } from './geminiLiveGroundingMetadata';

type HandleGeminiLiveSdkMessageOptions = {
  state: GeminiLiveTransportState;
  apiVersion: string;
  model: string;
  emit: (event: LiveSessionEvent) => void;
  logDiagnostic: (message: string, metadata?: Record<string, unknown>) => void;
  resolveSetup: () => void;
  rejectSetup: (detail: string) => void;
};

type GeminiLiveServerContent = NonNullable<GeminiLiveSdkServerMessage['serverContent']>;
type GeminiLiveModelTurnPart = NonNullable<NonNullable<GeminiLiveServerContent['modelTurn']>['parts']>[number];
type GeminiLiveTranscription =
  | NonNullable<GeminiLiveServerContent['inputTranscription']>
  | NonNullable<GeminiLiveServerContent['outputTranscription']>;

type ParsedTranscriptUpdate = {
  text: string;
  isFinal?: boolean;
};

type ParsedGeminiLiveServerMessage = {
  assistantTextDelta: string;
  inputTranscript: ParsedTranscriptUpdate | null;
  outputTranscript: ParsedTranscriptUpdate | null;
  modelTurnParts: GeminiLiveModelTurnPart[];
};

function parseTranscriptUpdate(
  transcription: GeminiLiveTranscription | null | undefined,
): ParsedTranscriptUpdate | null {
  if (!transcription?.text || transcription.text.length === 0) {
    return null;
  }

  return {
    text: transcription.text,
    ...(transcription.finished != null ? { isFinal: transcription.finished } : {}),
  };
}

function parseGeminiLiveServerMessage(
  message: GeminiLiveSdkServerMessage,
): ParsedGeminiLiveServerMessage {
  const modelTurnParts = message.serverContent?.modelTurn?.parts ?? [];
  const assistantTextDelta = modelTurnParts
    .map((part) => part.text ?? '')
    .join('');

  return {
    assistantTextDelta,
    inputTranscript: parseTranscriptUpdate(message.serverContent?.inputTranscription),
    outputTranscript: parseTranscriptUpdate(message.serverContent?.outputTranscription),
    modelTurnParts,
  };
}

function emitSessionResumptionUpdate(
  emit: (event: LiveSessionEvent) => void,
  message: GeminiLiveSdkServerMessage,
): void {
  if (!message.sessionResumptionUpdate) {
    return;
  }

  emit({
    type: 'session-resumption-update',
    handle:
      typeof message.sessionResumptionUpdate.newHandle === 'string' &&
      message.sessionResumptionUpdate.newHandle.length > 0
        ? message.sessionResumptionUpdate.newHandle
        : null,
    resumable: message.sessionResumptionUpdate.resumable !== false,
    detail: message.sessionResumptionUpdate.resumable === false
      ? 'Gemini Live session is not resumable at this point'
      : undefined,
  });
}

function emitToolCalls(
  emit: (event: LiveSessionEvent) => void,
  message: GeminiLiveSdkServerMessage,
): void {
  const toolCalls = normalizeToolCalls(message);

  if (toolCalls.length > 0) {
    emit({
      type: 'tool-call',
      calls: toolCalls,
    });
  }
}


function emitAnswerMetadata(
  emit: (event: LiveSessionEvent) => void,
  message: GeminiLiveSdkServerMessage,
): void {
  const answerMetadata = deriveAnswerMetadataFromGrounding(message.serverContent?.groundingMetadata);

  if (!answerMetadata) {
    return;
  }

  emit({
    type: 'answer-metadata',
    answerMetadata,
  });
}

function emitAudioEvents(
  emit: (event: LiveSessionEvent) => void,
  activeMode: LiveConnectMode | null,
  modelTurnParts: GeminiLiveModelTurnPart[],
): void {
  if (activeMode !== 'voice') {
    return;
  }

  for (const part of modelTurnParts) {
    const inlineData = part.inlineData;

    if (!inlineData?.data) {
      continue;
    }

    if (!isAssistantAudioMimeType(inlineData.mimeType)) {
      emit({
        type: 'audio-error',
        detail: `Unsupported assistant audio format: ${inlineData.mimeType ?? '(missing mime type)'}`,
      });
      continue;
    }

    try {
      emit({
        type: 'audio-chunk',
        chunk: decodeBase64Chunk(inlineData.data),
      });
    } catch {
      emit({
        type: 'audio-error',
        detail: 'Assistant audio payload was malformed',
      });
    }
  }
}

export function handleGeminiLiveSdkMessage({
  state,
  apiVersion,
  model,
  emit,
  logDiagnostic,
  resolveSetup,
  rejectSetup,
}: HandleGeminiLiveSdkMessageOptions, message: GeminiLiveSdkServerMessage): void {
  if (message.setupComplete) {
    state.hasCompletedSetup = true;
    logDiagnostic('setup complete', {
      apiVersion,
      model,
    });
    emit({ type: 'connection-state-changed', state: 'connected' });
    resolveSetup();
    return;
  }

  if (message.goAway) {
    const detail = getGoAwayDetail(message);
    const wasSetupCompleted = state.hasCompletedSetup;
    resetGeminiLiveTransportState(state, {
      hasReceivedGoAway: true,
    });
    logDiagnostic('go-away received', {
      detail,
    });
    emit({ type: 'go-away', detail });

    if (!wasSetupCompleted) {
      rejectSetup(detail);
    }

    return;
  }

  emitSessionResumptionUpdate(emit, message);
  emitAnswerMetadata(emit, message);
  const parsedMessage = parseGeminiLiveServerMessage(message);
  const textChunk = parsedMessage.assistantTextDelta;

  // Voice mode still forwards canonical assistant text so the session draft
  // can fall back when transcript packets are missing, delayed, or partial.
  if (textChunk.length > 0) {
    state.hasPendingTextResponse = true;
    emit({ type: 'text-delta', text: textChunk });
  }

  if (message.serverContent?.interrupted) {
    state.hasPendingTextResponse = false;
    emit({ type: 'interrupted' });
    return;
  }

  emitToolCalls(emit, message);

  if (parsedMessage.inputTranscript) {
    emit({
      type: 'input-transcript',
      ...parsedMessage.inputTranscript,
    });
  }

  if (parsedMessage.outputTranscript) {
    emit({
      type: 'output-transcript',
      ...parsedMessage.outputTranscript,
    });
  }

  emitAudioEvents(emit, state.activeMode, parsedMessage.modelTurnParts);

  if (message.serverContent?.generationComplete) {
    emit({ type: 'generation-complete' });
  }

  if (message.serverContent?.turnComplete) {
    state.hasPendingTextResponse = false;
    emit({ type: 'turn-complete' });
  }
}
