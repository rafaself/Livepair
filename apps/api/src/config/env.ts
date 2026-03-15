import 'dotenv/config';

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export const env = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  host: process.env['HOST'] ?? '127.0.0.1',
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  sessionTokenAuthSecret: process.env['SESSION_TOKEN_AUTH_SECRET'] ?? '',
  sessionTokenLiveModel: process.env['SESSION_TOKEN_LIVE_MODEL'] ?? '',
  databaseUrl: process.env['DATABASE_URL'] ?? '',
  ephemeralTokenTtlSeconds: parseInt(
    process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] ?? '60',
    10,
  ),
  sessionTokenRateLimitMaxRequests: parsePositiveInteger(
    process.env['SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS'],
    5,
  ),
  sessionTokenRateLimitWindowMs: parsePositiveInteger(
    process.env['SESSION_TOKEN_RATE_LIMIT_WINDOW_MS'],
    60_000,
  ),
  redisUrl: process.env['REDIS_URL'] ?? '',
};
