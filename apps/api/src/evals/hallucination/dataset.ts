import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  AnswerConfidence,
  AnswerMetadata,
  AnswerProvenance,
  ChatMessageRole,
} from '@livepair/shared-types';
import type {
  HallucinationBucket,
  HallucinationConversationTurn,
  HallucinationDatasetCase,
  HallucinationDatasetDocument,
  HallucinationRunArtifact,
  HallucinationRunResult,
  HallucinationSupportingEvidence,
} from './types';

const DATASET_FILE_NAME = 'wave5-regression.dataset.json';

function resolveDefaultDatasetPath(): string {
  const candidates = [
    resolve(__dirname, 'data', DATASET_FILE_NAME),
    resolve(process.cwd(), 'src/evals/hallucination/data', DATASET_FILE_NAME),
    resolve(process.cwd(), 'apps/api/src/evals/hallucination/data', DATASET_FILE_NAME),
  ];

  const existingPath = candidates.find((candidate) => existsSync(candidate));
  return existingPath ?? candidates[0]!;
}

export const DEFAULT_HALLUCINATION_DATASET_PATH = resolveDefaultDatasetPath();

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function assertNonEmptyString(value: unknown, path: string): string {
  if (!isNonEmptyString(value)) {
    throw new Error(`${path} must be a non-empty string`);
  }

  return value.trim();
}

function assertBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${path} must be a boolean`);
  }

  return value;
}

function isBucket(value: unknown): value is HallucinationBucket {
  return (
    value === 'project_specific_factual'
    || value === 'public_current_factual'
    || value === 'ambiguous'
    || value === 'impossible_or_insufficient'
  );
}

function assertBucket(value: unknown, path: string): HallucinationBucket {
  if (!isBucket(value)) {
    throw new Error(`${path} must be a supported hallucination bucket`);
  }

  return value;
}

function isAnswerProvenance(value: unknown): value is AnswerProvenance {
  return (
    value === 'project_grounded'
    || value === 'web_grounded'
    || value === 'tool_grounded'
    || value === 'unverified'
  );
}

function assertAnswerProvenance(value: unknown, path: string): AnswerProvenance {
  if (!isAnswerProvenance(value)) {
    throw new Error(`${path} must be a supported answer provenance`);
  }

  return value;
}

function isAnswerConfidence(value: unknown): value is AnswerConfidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function normalizeStringArray(value: unknown, path: string): string[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array of non-empty strings`);
  }

  const normalized = value.map((item, index) => assertNonEmptyString(item, `${path}[${index}]`));
  return normalized.length > 0 ? normalized : undefined;
}

function assertChatRole(value: unknown, path: string): ChatMessageRole {
  if (value !== 'user' && value !== 'assistant') {
    throw new Error(`${path} must be "user" or "assistant"`);
  }

  return value;
}

function normalizeConversationHistory(
  value: unknown,
  path: string,
): HallucinationConversationTurn[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value.map((turn, index) => {
    if (!isPlainRecord(turn)) {
      throw new Error(`${path}[${index}] must be an object`);
    }

    return {
      role: assertChatRole(turn['role'], `${path}[${index}].role`),
      content: assertNonEmptyString(turn['content'], `${path}[${index}].content`),
    };
  });
}

function normalizeDatasetCase(value: unknown, path: string): HallucinationDatasetCase {
  if (!isPlainRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return {
    id: assertNonEmptyString(value['id'], `${path}.id`),
    bucket: assertBucket(value['bucket'], `${path}.bucket`),
    prompt: assertNonEmptyString(value['prompt'], `${path}.prompt`),
    ...(typeof value['conversationHistory'] === 'undefined'
      ? {}
      : {
          conversationHistory: normalizeConversationHistory(
            value['conversationHistory'],
            `${path}.conversationHistory`,
          ),
        }),
    expectedPath: assertAnswerProvenance(value['expectedPath'], `${path}.expectedPath`),
    shouldUseProjectRetrieval: assertBoolean(
      value['shouldUseProjectRetrieval'],
      `${path}.shouldUseProjectRetrieval`,
    ),
    shouldUseWebGrounding: assertBoolean(
      value['shouldUseWebGrounding'],
      `${path}.shouldUseWebGrounding`,
    ),
    shouldAbstainOrBeCautious: assertBoolean(
      value['shouldAbstainOrBeCautious'],
      `${path}.shouldAbstainOrBeCautious`,
    ),
    ...(typeof value['reference'] === 'undefined'
      ? {}
      : { reference: assertNonEmptyString(value['reference'], `${path}.reference`) }),
    ...(typeof value['sourceText'] === 'undefined'
      ? {}
      : { sourceText: assertNonEmptyString(value['sourceText'], `${path}.sourceText`) }),
    ...(typeof value['requiredSubstrings'] === 'undefined'
      ? {}
      : {
          requiredSubstrings: normalizeStringArray(
            value['requiredSubstrings'],
            `${path}.requiredSubstrings`,
          ),
        }),
    ...(typeof value['forbiddenSubstrings'] === 'undefined'
      ? {}
      : {
          forbiddenSubstrings: normalizeStringArray(
            value['forbiddenSubstrings'],
            `${path}.forbiddenSubstrings`,
          ),
        }),
    ...(typeof value['requiredCautionSubstrings'] === 'undefined'
      ? {}
      : {
          requiredCautionSubstrings: normalizeStringArray(
            value['requiredCautionSubstrings'],
            `${path}.requiredCautionSubstrings`,
          ),
        }),
    ...(typeof value['notes'] === 'undefined'
      ? {}
      : { notes: assertNonEmptyString(value['notes'], `${path}.notes`) }),
  };
}

export function validateHallucinationDatasetDocument(
  value: unknown,
): HallucinationDatasetDocument {
  if (!isPlainRecord(value)) {
    throw new Error('dataset must be an object');
  }

  if (value['schemaVersion'] !== 1) {
    throw new Error('dataset.schemaVersion must equal 1');
  }

  const datasetId = assertNonEmptyString(value['datasetId'], 'dataset.datasetId');
  const rawCases = value['cases'];

  if (!Array.isArray(rawCases)) {
    throw new Error('dataset.cases must be an array');
  }

  const cases = rawCases.map((testCase, index) =>
    normalizeDatasetCase(testCase, `dataset.cases[${index}]`));
  const seenIds = new Set<string>();

  for (const [index, testCase] of cases.entries()) {
    if (seenIds.has(testCase.id)) {
      throw new Error(`dataset.cases[${index}].id must be unique`);
    }
    seenIds.add(testCase.id);
  }

  return {
    schemaVersion: 1,
    datasetId,
    cases,
  };
}

function normalizeAnswerMetadata(value: unknown, path: string): AnswerMetadata | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!isPlainRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  const provenance = assertAnswerProvenance(value['provenance'], `${path}.provenance`);
  const citationsValue = value['citations'];
  const confidenceValue = value['confidence'];
  const reasonValue = value['reason'];

  if (typeof confidenceValue !== 'undefined' && !isAnswerConfidence(confidenceValue)) {
    throw new Error(`${path}.confidence must be low, medium, or high`);
  }

  if (typeof reasonValue !== 'undefined' && !isNonEmptyString(reasonValue)) {
    throw new Error(`${path}.reason must be a non-empty string`);
  }

  if (typeof citationsValue !== 'undefined' && !Array.isArray(citationsValue)) {
    throw new Error(`${path}.citations must be an array`);
  }

  const citations = citationsValue?.map((citation, index) => {
    if (!isPlainRecord(citation)) {
      throw new Error(`${path}.citations[${index}] must be an object`);
    }

    const label = assertNonEmptyString(citation['label'], `${path}.citations[${index}].label`);
    const uri = citation['uri'];

    if (typeof uri !== 'undefined' && !isNonEmptyString(uri)) {
      throw new Error(`${path}.citations[${index}].uri must be a non-empty string`);
    }

    return {
      label,
      ...(typeof uri === 'string' ? { uri: uri.trim() } : {}),
    };
  });

  return {
    provenance,
    ...(citations && citations.length > 0 ? { citations } : {}),
    ...(typeof confidenceValue === 'string' ? { confidence: confidenceValue } : {}),
    ...(typeof reasonValue === 'string' ? { reason: reasonValue.trim() } : {}),
  };
}

function normalizeSupportingEvidence(
  value: unknown,
  path: string,
): HallucinationSupportingEvidence[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  return value.map((entry, index) => {
    if (!isPlainRecord(entry)) {
      throw new Error(`${path}[${index}] must be an object`);
    }

    const uri = entry['uri'];
    const text = entry['text'];

    if (typeof uri !== 'undefined' && !isNonEmptyString(uri)) {
      throw new Error(`${path}[${index}].uri must be a non-empty string`);
    }

    if (typeof text !== 'undefined' && !isNonEmptyString(text)) {
      throw new Error(`${path}[${index}].text must be a non-empty string`);
    }

    return {
      label: assertNonEmptyString(entry['label'], `${path}[${index}].label`),
      ...(typeof uri === 'string' ? { uri: uri.trim() } : {}),
      ...(typeof text === 'string' ? { text: text.trim() } : {}),
    };
  });
}

function normalizeRunResult(value: unknown, path: string): HallucinationRunResult {
  if (!isPlainRecord(value)) {
    throw new Error(`${path} must be an object`);
  }

  return {
    id: assertNonEmptyString(value['id'], `${path}.id`),
    response: assertNonEmptyString(value['response'], `${path}.response`),
    ...(typeof value['answerMetadata'] === 'undefined'
      ? {}
      : { answerMetadata: normalizeAnswerMetadata(value['answerMetadata'], `${path}.answerMetadata`) }),
    ...(typeof value['usedProjectRetrieval'] === 'undefined'
      ? {}
      : {
          usedProjectRetrieval: assertBoolean(
            value['usedProjectRetrieval'],
            `${path}.usedProjectRetrieval`,
          ),
        }),
    ...(typeof value['usedWebGrounding'] === 'undefined'
      ? {}
      : {
          usedWebGrounding: assertBoolean(
            value['usedWebGrounding'],
            `${path}.usedWebGrounding`,
          ),
        }),
    ...(typeof value['supportingEvidence'] === 'undefined'
      ? {}
      : {
          supportingEvidence: normalizeSupportingEvidence(
            value['supportingEvidence'],
            `${path}.supportingEvidence`,
          ),
        }),
    ...(typeof value['notes'] === 'undefined'
      ? {}
      : { notes: assertNonEmptyString(value['notes'], `${path}.notes`) }),
  };
}

export function validateHallucinationRunArtifact(value: unknown): HallucinationRunArtifact {
  if (!isPlainRecord(value)) {
    throw new Error('run artifact must be an object');
  }

  if (value['schemaVersion'] !== 1) {
    throw new Error('runArtifact.schemaVersion must equal 1');
  }

  const datasetId = assertNonEmptyString(value['datasetId'], 'runArtifact.datasetId');
  const runLabel = assertNonEmptyString(value['runLabel'], 'runArtifact.runLabel');
  const generatedAt = assertNonEmptyString(value['generatedAt'], 'runArtifact.generatedAt');
  const rawResults = value['results'];

  if (!Array.isArray(rawResults)) {
    throw new Error('runArtifact.results must be an array');
  }

  const results = rawResults.map((result, index) =>
    normalizeRunResult(result, `runArtifact.results[${index}]`));
  const seenIds = new Set<string>();

  for (const [index, result] of results.entries()) {
    if (seenIds.has(result.id)) {
      throw new Error(`runArtifact.results[${index}].id must be unique`);
    }
    seenIds.add(result.id);
  }

  return {
    schemaVersion: 1,
    datasetId,
    runLabel,
    generatedAt,
    results,
  };
}

function parseJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8')) as unknown;
}

export function loadHallucinationDataset(path = DEFAULT_HALLUCINATION_DATASET_PATH): HallucinationDatasetDocument {
  return validateHallucinationDatasetDocument(parseJsonFile(path));
}

export function loadHallucinationRunArtifact(path: string): HallucinationRunArtifact {
  return validateHallucinationRunArtifact(parseJsonFile(path));
}
