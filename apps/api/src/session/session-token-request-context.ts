export type SessionTokenRequestLike = {
  ip?: string | undefined;
  method?: string | undefined;
  originalUrl?: string | undefined;
  url?: string | undefined;
  socket?: {
    remoteAddress?: string | undefined;
  };
};

export function resolveSessionTokenRequestContext(request: SessionTokenRequestLike): {
  clientIp: string;
  method: string;
  path: string;
} {
  return {
    clientIp:
      request.ip?.trim() || request.socket?.remoteAddress?.trim() || 'unknown',
    method: request.method ?? 'POST',
    path: request.originalUrl ?? request.url ?? '/session/token',
  };
}
