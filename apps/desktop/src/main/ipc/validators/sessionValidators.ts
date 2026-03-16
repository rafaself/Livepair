import type {
  CreateEphemeralTokenRequest,
  ProjectKnowledgeSearchRequest,
} from '@livepair/shared-types';
import {
  hasOnlyAllowedKeys,
  isNonEmptyString,
  isPlainRecord,
} from './shared';

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

export function isProjectKnowledgeSearchRequest(
  req: unknown,
): req is ProjectKnowledgeSearchRequest {
  return (
    isPlainRecord(req)
    && hasOnlyAllowedKeys(req, ['query'])
    && isNonEmptyString(req['query'])
  );
}
