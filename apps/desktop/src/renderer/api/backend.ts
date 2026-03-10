import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  TextChatRequest,
} from '@livepair/shared-types';
import type { TextChatStreamHandle } from '../../shared/desktopBridge';

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await window.bridge.checkHealth();
    return response.status === 'ok';
  } catch {
    return false;
  }
}

export function requestSessionToken(
  req: CreateEphemeralTokenRequest,
): Promise<CreateEphemeralTokenResponse> {
  return window.bridge.requestSessionToken(req);
}

export function startTextChatStream(
  req: TextChatRequest,
  onEvent: Parameters<typeof window.bridge.startTextChatStream>[1],
): Promise<TextChatStreamHandle> {
  return window.bridge.startTextChatStream(req, onEvent);
}
