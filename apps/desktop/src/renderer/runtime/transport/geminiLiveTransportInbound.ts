import type { AnswerConfidence, AnswerMetadata, AnswerCitation } from '@livepair/shared-types';
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
type GeminiLiveGroundingMetadata = NonNullable<GeminiLiveServerContent['groundingMetadata']>;
type GeminiLiveGroundingChunk = NonNullable<GeminiLiveGroundingMetadata['groundingChunks']>[number];
type GeminiLiveGroundingSupport = NonNullable<GeminiLiveGroundingMetadata['groundingSupports']>[number];

const GROUNDING_CITATION_LIMIT = 3;

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

function normalizeGroundingCitation(
  chunk: GeminiLiveGroundingChunk | undefined,
): AnswerCitation | null {
  const webChunk = chunk?.web;

  if (!webChunk) {
    return null;
  }

  const label = webChunk.title?.trim() || webChunk.uri?.trim();

  if (!label) {
    return null;
  }

  return {
    label,
    ...(webChunk.uri?.trim() ? { uri: webChunk.uri.trim() } : {}),
  };
}

function deriveGroundingConfidence(
  supports: GeminiLiveGroundingSupport[],
): AnswerConfidence {
  const confidenceScores = supports
    .flatMap((support) => support.confidenceScores ?? [])
    .filter((score) => Number.isFinite(score));

  if (confidenceScores.length === 0) {
    return 'medium';
  }

  const maxConfidence = Math.max(...confidenceScores);

  if (maxConfidence >= 0.85) {
    return 'high';
  }

  if (maxConfidence >= 0.6) {
    return 'medium';
  }

  return 'low';
}

function deriveAnswerMetadataFromGrounding(
  groundingMetadata: GeminiLiveGroundingMetadata | null | undefined,
): AnswerMetadata | null {
  if (!groundingMetadata) {
    return null;
  }

  const groundingChunks = groundingMetadata.groundingChunks ?? [];
  const supportingWebEntries = (groundingMetadata.groundingSupports ?? [])
    .map((support) => {
      const indices = support.groundingChunkIndices ?? [];
      const citations = indices
        .map((index) => normalizeGroundingCitation(groundingChunks[index]))
        .filter((citation): citation is AnswerCitation => citation !== null);

      if (citations.length === 0) {
        return null;
      }

      return {
        support,
        citations,
      };
    })
    .filter((entry): entry is {
      support: GeminiLiveGroundingSupport;
      citations: AnswerCitation[];
    } => entry !== null);

  if (supportingWebEntries.length > 0) {
    const citations = supportingWebEntries
      .flatMap((entry) => entry.citations)
      .filter((citation, index, allCitations) =>
        allCitations.findIndex((candidate) =>
          candidate.uri
            ? candidate.uri === citation.uri
            : candidate.label === citation.label) === index)
      .slice(0, GROUNDING_CITATION_LIMIT);

    return {
      provenance: 'web_grounded',
      confidence: deriveGroundingConfidence(supportingWebEntries.map((entry) => entry.support)),
      citations,
      reason: 'Derived from Gemini Live grounding metadata with web support.',
    };
  }

  const attemptedWebGrounding =
    (groundingMetadata.webSearchQueries?.length ?? 0) > 0
    || groundingChunks.some((chunk) => chunk.web);

  if (!attemptedWebGrounding) {
    return null;
  }

  return {
    provenance: 'unverified',
    confidence: 'low',
    reason: 'Google Search grounding did not return enough supporting evidence.',
  };
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

  if (textChunk.length > 0 && state.activeMode !== 'voice') {
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
