import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await window.bridge.checkHealth();
    return response.status === 'ok';
  } catch {
    return false;
  }
}

export function requestSessionToken(): Promise<CreateEphemeralTokenResponse> {
  return window.bridge.requestSessionToken();
}
