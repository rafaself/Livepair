import 'dotenv/config';

function validateGeminiTextModel(value: string | undefined): string {
  const normalized = value?.trim() ?? '';

  if (!normalized) {
    return 'gemini-2.5-flash';
  }

  const lowerCaseModel = normalized.toLowerCase();
  if (lowerCaseModel.includes('live') || lowerCaseModel.includes('audio')) {
    throw new Error(
      'Invalid GEMINI_TEXT_MODEL: text mode cannot use Gemini Live or audio models',
    );
  }

  return normalized;
}

export const env = {
  port: parseInt(process.env['PORT'] ?? '3000', 10),
  host: process.env['HOST'] ?? '127.0.0.1',
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  geminiTextModel: validateGeminiTextModel(process.env['GEMINI_TEXT_MODEL']),
  ephemeralTokenTtlSeconds: parseInt(
    process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] ?? '60',
    10,
  ),
  redisUrl: process.env['REDIS_URL'] ?? '',
};
