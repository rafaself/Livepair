import type { LiveSessionEvent } from './transport.types';
import type { SessionMode } from '../core/session.types';
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

function emitAudioEvents(
  emit: (event: LiveSessionEvent) => void,
  activeMode: SessionMode | null,
  message: GeminiLiveSdkServerMessage,
): void {
  if (activeMode !== 'voice') {
    return;
  }

  const parts = message.serverContent?.modelTurn?.parts ?? [];

  for (const part of parts) {
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
  emitToolCalls(emit, message);

  const textChunk = message.text ?? '';

  if (textChunk.length > 0) {
    state.pendingOutputText = `${state.pendingOutputText}${textChunk}`;
    emit({ type: 'text-delta', text: textChunk });
  }

  if (message.serverContent?.interrupted) {
    state.pendingOutputText = '';
    emit({ type: 'interrupted' });
    return;
  }

  const inputTranscriptText = message.serverContent?.inputTranscription?.text;

  if (inputTranscriptText && inputTranscriptText.length > 0) {
    emit({
      type: 'input-transcript',
      text: inputTranscriptText,
    });
  }

  const outputTranscriptText = message.serverContent?.outputTranscription?.text;

  if (outputTranscriptText && outputTranscriptText.length > 0) {
    emit({
      type: 'output-transcript',
      text: outputTranscriptText,
    });
  }

  emitAudioEvents(emit, state.activeMode, message);

  if (message.serverContent?.generationComplete) {
    emit({ type: 'generation-complete' });
  }

  if (message.serverContent?.turnComplete) {
    if (state.pendingOutputText.length > 0) {
      emit({ type: 'text-message', text: state.pendingOutputText });
      state.pendingOutputText = '';
    }

    emit({ type: 'turn-complete' });
  }
}
