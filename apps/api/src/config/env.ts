import './loadRootEnv';

const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_SESSION_TOKEN_LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';
const DEFAULT_DATABASE_URL = 'postgres://livepair:livepair@127.0.0.1:5432/livepair';
const DEFAULT_EPHEMERAL_TOKEN_TTL_SECONDS = 60;
const DEFAULT_SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS = 5;
const DEFAULT_SESSION_TOKEN_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_PROJECT_KNOWLEDGE_SEARCH_MODEL = 'models/gemini-2.5-flash';
const DEFAULT_PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME = 'livepair-project-knowledge';
const DEFAULT_PROJECT_KNOWLEDGE_PREWARM_ENABLED = false;
const DEFAULT_PROJECT_KNOWLEDGE_RATE_LIMIT_MAX_REQUESTS = 10;
const DEFAULT_PROJECT_KNOWLEDGE_RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_DISABLE_HTTP_LISTEN = false;
const DEFAULT_NODE_ENV = 'development';

export type ApiRuntimeEnv = {
  port: number;
  host: string;
  nodeEnv: string;
  disableHttpListen: boolean;
  corsAllowedOrigins: string[];
  geminiApiKey: string;
  sessionTokenAuthSecret: string;
  sessionTokenLiveModel: string;
  databaseUrl: string;
  ephemeralTokenTtlSeconds: number;
  sessionTokenRateLimitMaxRequests: number;
  sessionTokenRateLimitWindowMs: number;
  projectKnowledgeSearchModel: string;
  projectKnowledgeFileSearchStore: string;
  projectKnowledgeFileSearchStoreDisplayName: string;
  projectKnowledgePrewarmEnabled: boolean;
  projectKnowledgeRateLimitMaxRequests: number;
  projectKnowledgeRateLimitWindowMs: number;
};

function hasNonEmptyValue(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function readTrimmedString(value: string | undefined, fallback: string, envName: string): string {
  if (typeof value === 'undefined') {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Environment variable ${envName} must not be empty`);
  }

  return trimmed;
}

function requireNonEmptyString(value: string | undefined, envName: string): string {
  if (!hasNonEmptyValue(value)) {
    throw new Error(`Missing required environment variable ${envName}`);
  }

  return value!.trim();
}

function parsePort(value: string | undefined, fallback: number, envName: string): number {
  if (typeof value === 'undefined') {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`Environment variable ${envName} must be a valid TCP port`);
  }

  return parsed;
}

function parsePositiveInteger(value: string | undefined, fallback: number, envName: string): number {
  if (typeof value === 'undefined') {
    return fallback;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${envName} must be a positive integer`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, fallback: boolean, envName: string): boolean {
  if (typeof value === 'undefined') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') {
    return true;
  }

  if (normalized === 'false') {
    return false;
  }

  throw new Error(`Environment variable ${envName} must be "true" or "false"`);
}

function normalizeAllowedOrigin(origin: string): string {
  if (origin === '*') {
    throw new Error(
      'Environment variable CORS_ALLOWED_ORIGINS must list explicit origins instead of "*"',
    );
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw new Error(
      'Environment variable CORS_ALLOWED_ORIGINS must be a comma-separated list of http(s) origins',
    );
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      'Environment variable CORS_ALLOWED_ORIGINS must be a comma-separated list of http(s) origins',
    );
  }

  return url.origin;
}

function parseAllowedOrigins(value: string | undefined): string[] {
  if (!hasNonEmptyValue(value)) {
    return [];
  }

  const configuredOrigins = value!.split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const seenOrigins = new Set<string>();
  const allowedOrigins: string[] = [];

  for (const origin of configuredOrigins) {
    const normalizedOrigin = normalizeAllowedOrigin(origin);
    if (!seenOrigins.has(normalizedOrigin)) {
      seenOrigins.add(normalizedOrigin);
      allowedOrigins.push(normalizedOrigin);
    }
  }

  return allowedOrigins;
}

function validateSessionTokenLiveModel(model: string): string {
  if (!model.startsWith('models/')) {
    throw new Error(
      'Environment variable SESSION_TOKEN_LIVE_MODEL must use the "models/..." resource format',
    );
  }

  return model;
}

function buildApiRuntimeEnv(runtimeEnv: NodeJS.ProcessEnv = process.env): ApiRuntimeEnv {
  return {
    port: parsePort(runtimeEnv['PORT'], DEFAULT_PORT, 'PORT'),
    host: readTrimmedString(runtimeEnv['HOST'], DEFAULT_HOST, 'HOST'),
    nodeEnv: hasNonEmptyValue(runtimeEnv['NODE_ENV'])
      ? runtimeEnv['NODE_ENV']!.trim()
      : DEFAULT_NODE_ENV,
    disableHttpListen: parseBoolean(
      runtimeEnv['DISABLE_HTTP_LISTEN'],
      DEFAULT_DISABLE_HTTP_LISTEN,
      'DISABLE_HTTP_LISTEN',
    ),
    corsAllowedOrigins: parseAllowedOrigins(runtimeEnv['CORS_ALLOWED_ORIGINS']),
    geminiApiKey: runtimeEnv['GEMINI_API_KEY']?.trim() ?? '',
    sessionTokenAuthSecret: runtimeEnv['SESSION_TOKEN_AUTH_SECRET']?.trim() ?? '',
    sessionTokenLiveModel: validateSessionTokenLiveModel(
      readTrimmedString(
        runtimeEnv['SESSION_TOKEN_LIVE_MODEL'],
        DEFAULT_SESSION_TOKEN_LIVE_MODEL,
        'SESSION_TOKEN_LIVE_MODEL',
      ),
    ),
    databaseUrl: readTrimmedString(
      runtimeEnv['DATABASE_URL'],
      DEFAULT_DATABASE_URL,
      'DATABASE_URL',
    ),
    ephemeralTokenTtlSeconds: parsePositiveInteger(
      runtimeEnv['EPHEMERAL_TOKEN_TTL_SECONDS'],
      DEFAULT_EPHEMERAL_TOKEN_TTL_SECONDS,
      'EPHEMERAL_TOKEN_TTL_SECONDS',
    ),
    sessionTokenRateLimitMaxRequests: parsePositiveInteger(
      runtimeEnv['SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS'],
      DEFAULT_SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS,
      'SESSION_TOKEN_RATE_LIMIT_MAX_REQUESTS',
    ),
    sessionTokenRateLimitWindowMs: parsePositiveInteger(
      runtimeEnv['SESSION_TOKEN_RATE_LIMIT_WINDOW_MS'],
      DEFAULT_SESSION_TOKEN_RATE_LIMIT_WINDOW_MS,
      'SESSION_TOKEN_RATE_LIMIT_WINDOW_MS',
    ),
    projectKnowledgeSearchModel: readTrimmedString(
      runtimeEnv['PROJECT_KNOWLEDGE_SEARCH_MODEL'],
      DEFAULT_PROJECT_KNOWLEDGE_SEARCH_MODEL,
      'PROJECT_KNOWLEDGE_SEARCH_MODEL',
    ),
    projectKnowledgeFileSearchStore: runtimeEnv['PROJECT_KNOWLEDGE_FILE_SEARCH_STORE']?.trim() ?? '',
    projectKnowledgeFileSearchStoreDisplayName: readTrimmedString(
      runtimeEnv['PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME'],
      DEFAULT_PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME,
      'PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME',
    ),
    projectKnowledgePrewarmEnabled: parseBoolean(
      runtimeEnv['PROJECT_KNOWLEDGE_PREWARM_ENABLED'],
      DEFAULT_PROJECT_KNOWLEDGE_PREWARM_ENABLED,
      'PROJECT_KNOWLEDGE_PREWARM_ENABLED',
    ),
    projectKnowledgeRateLimitMaxRequests: parsePositiveInteger(
      runtimeEnv['PROJECT_KNOWLEDGE_RATE_LIMIT_MAX_REQUESTS'],
      DEFAULT_PROJECT_KNOWLEDGE_RATE_LIMIT_MAX_REQUESTS,
      'PROJECT_KNOWLEDGE_RATE_LIMIT_MAX_REQUESTS',
    ),
    projectKnowledgeRateLimitWindowMs: parsePositiveInteger(
      runtimeEnv['PROJECT_KNOWLEDGE_RATE_LIMIT_WINDOW_MS'],
      DEFAULT_PROJECT_KNOWLEDGE_RATE_LIMIT_WINDOW_MS,
      'PROJECT_KNOWLEDGE_RATE_LIMIT_WINDOW_MS',
    ),
  };
}

export function readApiRuntimeEnv(runtimeEnv: NodeJS.ProcessEnv = process.env): ApiRuntimeEnv {
  return buildApiRuntimeEnv(runtimeEnv);
}

export const env = buildApiRuntimeEnv();

export function validateApiRuntimeEnv(requiredEnv: NodeJS.ProcessEnv = process.env): void {
  requireNonEmptyString(requiredEnv['GEMINI_API_KEY'], 'GEMINI_API_KEY');
  requireNonEmptyString(
    requiredEnv['SESSION_TOKEN_AUTH_SECRET'],
    'SESSION_TOKEN_AUTH_SECRET',
  );

  buildApiRuntimeEnv(requiredEnv);
}
