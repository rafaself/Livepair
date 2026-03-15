import 'dotenv/config';

export const env = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  host: process.env['HOST'] ?? '127.0.0.1',
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  databaseUrl: process.env['DATABASE_URL'] ?? '',
  ephemeralTokenTtlSeconds: parseInt(
    process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] ?? '60',
    10,
  ),
  redisUrl: process.env['REDIS_URL'] ?? '',
};
