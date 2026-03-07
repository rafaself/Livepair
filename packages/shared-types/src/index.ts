export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

export interface CreateEphemeralTokenRequest {
  sessionId?: string;
}

export interface CreateEphemeralTokenResponse {
  token: string;
  expiresAt: string;
  /** Marks this as a placeholder stub — not a real Gemini ephemeral token */
  isStub: true;
}
