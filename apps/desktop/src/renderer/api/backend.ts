import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  LiveTelemetryEvent,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
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

export function reportLiveTelemetry(events: LiveTelemetryEvent[]): Promise<void> {
  return window.bridge.reportLiveTelemetry(events);
}

export function searchProjectKnowledge(
  req: ProjectKnowledgeSearchRequest,
): Promise<ProjectKnowledgeSearchResult> {
  return window.bridge.searchProjectKnowledge(req);
}
