import type { CreateEphemeralTokenRequest } from '@livepair/shared-types';
import { hasOnlyAllowedKeys, isPlainRecord } from './shared';

export function isCreateEphemeralTokenRequest(
  req: unknown,
): req is CreateEphemeralTokenRequest {
  if (!isPlainRecord(req) || !hasOnlyAllowedKeys(req, ['sessionId'])) {
    return false;
  }

  if (!('sessionId' in req)) {
    return true;
  }

  const sessionId = req['sessionId'];
  return typeof sessionId === 'string' || typeof sessionId === 'undefined';
}
