import type { VoiceToolCall } from '../voice/voice.types';
import type { GeminiLiveSdkServerMessage, GeminiLiveSdkSession } from './geminiLiveSdkClient';

const ASSISTANT_AUDIO_MIME_TYPE_PREFIX = 'audio/pcm';

export function createTransportError(detail: string): Error {
  return new Error(detail);
}

export function getErrorDetail(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
}

export function getCloseReason(event: CloseEvent, fallback: string): string {
  return event.reason || fallback;
}

export function getErrorEventDetail(event: ErrorEvent, fallback: string): string {
  if (event.message) {
    return event.message;
  }

  if (event.error instanceof Error && event.error.message.length > 0) {
    return event.error.message;
  }

  return fallback;
}

export function getGoAwayDetail(message: GeminiLiveSdkServerMessage): string {
  const timeLeft = message.goAway?.timeLeft;

  if (message.goAway?.reason) {
    return message.goAway.reason;
  }

  if (timeLeft) {
    return `Gemini Live session is shutting down soon (${timeLeft} remaining)`;
  }

  return 'Gemini Live session was rejected';
}

export function closeGeminiLiveSdkSession(session: GeminiLiveSdkSession | null): void {
  session?.close();
}

function normalizeToolCallArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function normalizeToolCalls(message: GeminiLiveSdkServerMessage): VoiceToolCall[] {
  const functionCalls = message.toolCall?.functionCalls;

  if (!functionCalls?.length) {
    return [];
  }

  return functionCalls.map((call) => ({
    id: call.id ?? call.name ?? crypto.randomUUID(),
    name: call.name ?? 'unknown_tool',
    arguments: normalizeToolCallArguments(call.args),
  }));
}

// Intentionally uses a for-of loop rather than String.fromCharCode(...chunk).
// The spread form can overflow the call stack for large typed arrays; the loop
// is safe for any chunk size and is sufficient for the small PCM frames used here.
export function encodeChunkToBase64(chunk: Uint8Array): string {
  let binary = '';

  for (const value of chunk) {
    binary += String.fromCharCode(value);
  }

  return btoa(binary);
}

export function decodeBase64Chunk(data: string): Uint8Array {
  const binary = atob(data);
  const chunk = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    chunk[index] = binary.charCodeAt(index);
  }

  return chunk;
}

export function isAssistantAudioMimeType(mimeType: string | undefined): boolean {
  return mimeType?.startsWith(ASSISTANT_AUDIO_MIME_TYPE_PREFIX) ?? false;
}
