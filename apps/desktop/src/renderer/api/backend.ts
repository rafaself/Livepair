import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

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
