import './loadRootEnv';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_SESSION_TOKEN_AUTH_SECRET = 'livepair-local-session-token-secret';
const DEFAULT_SESSION_TOKEN_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_DATABASE_URL = 'postgres://livepair:livepair@127.0.0.1:5432/livepair';
const DEFAULT_EPHEMERAL_TOKEN_TTL_SECONDS = 60;
const DEFAULT_SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS = 5;
const DEFAULT_SESSION_TOKEN_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PROJECT_KNOWLEDGE_SEARCH_MODEL = 'models/gemini-2.5-flash';
const DEFAULT_PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME = 'livepair-project-knowledge';

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function hasNonEmptyValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export const env = {
  port: parseInt(process.env['PORT'] ?? String(DEFAULT_PORT), 10),
  host: process.env['HOST'] ?? DEFAULT_HOST,
  geminiApiKey: process.env['GEMINI_API_KEY'] ?? '',
  sessionTokenAuthSecret:
    process.env['SESSION_TOKEN_AUTH_SECRET'] ?? DEFAULT_SESSION_TOKEN_AUTH_SECRET,
  sessionTokenLiveModel:
    process.env['SESSION_TOKEN_LIVE_MODEL'] ?? DEFAULT_SESSION_TOKEN_LIVE_MODEL,
  databaseUrl: process.env['DATABASE_URL'] ?? DEFAULT_DATABASE_URL,
  ephemeralTokenTtlSeconds: parseInt(
    process.env['EPHEMERAL_TOKEN_TTL_SECONDS'] ?? String(DEFAULT_EPHEMERAL_TOKEN_TTL_SECONDS),
    10,
  ),
  sessionTokenRateLimitMaxRequests: parsePositiveInteger(
    process.env['SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS'],
    DEFAULT_SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS,
  ),
  sessionTokenRateLimitWindowMs: parsePositiveInteger(
    process.env['SESSION_TOKEN_RATE_LIMIT_WINDOW_MS'],
    DEFAULT_SESSION_TOKEN_RATE_LIMIT_WINDOW_MS,
  ),
  projectKnowledgeSearchModel:
    process.env['PROJECT_KNOWLEDGE_SEARCH_MODEL'] ?? DEFAULT_PROJECT_KNOWLEDGE_SEARCH_MODEL,
  projectKnowledgeFileSearchStore: process.env['PROJECT_KNOWLEDGE_FILE_SEARCH_STORE'] ?? '',
  projectKnowledgeFileSearchStoreDisplayName:
    process.env['PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME']
    ?? DEFAULT_PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME,
};

export function validateApiRuntimeEnv(requiredEnv: NodeJS.ProcessEnv = process.env): void {
  if (!hasNonEmptyValue(requiredEnv['GEMINI_API_KEY'])) {
    throw new Error('Missing required environment variable GEMINI_API_KEY');
  }
}
