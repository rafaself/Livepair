export const env = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  ephemeralTokenTtlSeconds: parseInt(
    process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] ?? '60',
    10,
  ),
  redisUrl: process.env['REDIS_URL'] ?? '',
};
