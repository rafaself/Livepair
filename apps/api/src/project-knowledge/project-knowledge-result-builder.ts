import type {
  AnswerMetadata,
  ProjectKnowledgeSearchResult,
  ProjectKnowledgeSourceReference,
  ProjectKnowledgeSupportingExcerpt,
} from '@livepair/shared-types';
import type { ProjectKnowledgeCorpusDocument } from './project-knowledge-corpus';

export type GroundingChunk = {
  title: string;
  text: string;
};

export type GroundingSupport = {
  groundingChunkIndices: number[];
};

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

export function normalizeGroundingChunks(value: unknown): GroundingChunk[] {
  if (!isPlainRecord(value) || !Array.isArray(value['groundingChunks'])) {
    return [];
  }

  return value['groundingChunks']
    .flatMap((chunk): GroundingChunk[] => {
      if (
        !isPlainRecord(chunk)
        || !isPlainRecord(chunk['retrievedContext'])
        || !isNonEmptyString(chunk['retrievedContext']['title'])
        || !isNonEmptyString(chunk['retrievedContext']['text'])
      ) {
        return [];
      }

      return [
        {
          title: chunk['retrievedContext']['title'].trim(),
          text: chunk['retrievedContext']['text'].trim(),
        },
      ];
    });
}

export function normalizeGroundingSupports(value: unknown): GroundingSupport[] {
  if (!isPlainRecord(value) || !Array.isArray(value['groundingSupports'])) {
    return [];
  }

  return value['groundingSupports']
    .flatMap((support): GroundingSupport[] => {
      if (!isPlainRecord(support) || !Array.isArray(support['groundingChunkIndices'])) {
        return [];
      }

      const indices = support['groundingChunkIndices']
        .filter((index): index is number => typeof index === 'number' && Number.isInteger(index))
        .filter((index) => index >= 0);

      if (indices.length === 0) {
        return [];
      }

      return [{ groundingChunkIndices: indices }];
    });
}

// Safe fallback used for all failure and no-match paths.
export const UNSUPPORTED_RETRIEVAL_ANSWER = 'I could not verify that from the curated project documents.';

export function truncateExcerpt(text: string, maxLength = 220): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildNoMatchResult(
  summaryAnswer: string,
  failureReason: string,
): ProjectKnowledgeSearchResult {
  return {
    summaryAnswer,
    supportingExcerpts: [],
    sources: [],
    confidence: 'low',
    retrievalStatus: 'no_match',
    failureReason,
  };
}

export function buildFailedResult(
  retrievalStatus: 'failed' | 'not_ready',
  failureReason: string,
): ProjectKnowledgeSearchResult {
  return {
    summaryAnswer: UNSUPPORTED_RETRIEVAL_ANSWER,
    supportingExcerpts: [],
    sources: [],
    confidence: 'low',
    retrievalStatus,
    failureReason,
  };
}

export function buildCorpusIndex(
  corpus: readonly ProjectKnowledgeCorpusDocument[],
): Map<string, ProjectKnowledgeCorpusDocument> {
  return new Map(corpus.map((document) => [document.title, document]));
}

export function buildAnswerMetadata(result: ProjectKnowledgeSearchResult): AnswerMetadata | null {
  if (result.retrievalStatus !== 'grounded') {
    return null;
  }

  return {
    provenance: 'project_grounded',
    citations: result.sources.map((source) => ({
      label: source.path ?? source.title,
    })),
    confidence: result.confidence,
    reason: 'Derived from successful project knowledge retrieval.',
  };
}

export function buildSearchResult(
  answerText: string,
  groundingMetadata: unknown,
  corpus: readonly ProjectKnowledgeCorpusDocument[],
): ProjectKnowledgeSearchResult {
  const chunks = normalizeGroundingChunks(groundingMetadata);

  if (chunks.length === 0) {
    return buildNoMatchResult(UNSUPPORTED_RETRIEVAL_ANSWER, 'no_grounding_chunks');
  }

  const supports = normalizeGroundingSupports(groundingMetadata);
  const preferredIndices: number[] = [];
  const seenIndices = new Set<number>();

  for (const support of supports) {
    for (const index of support.groundingChunkIndices) {
      if (index < chunks.length && !seenIndices.has(index)) {
        seenIndices.add(index);
        preferredIndices.push(index);
      }
    }
  }

  if (preferredIndices.length === 0) {
    return buildNoMatchResult(UNSUPPORTED_RETRIEVAL_ANSWER, 'no_grounding_supports');
  }

  const normalizedAnswer = answerText.trim() || UNSUPPORTED_RETRIEVAL_ANSWER;

  const corpusByTitle = buildCorpusIndex(corpus);
  const sources: ProjectKnowledgeSourceReference[] = [];
  const excerpts: ProjectKnowledgeSupportingExcerpt[] = [];
  const seenSourceIds = new Set<string>();

  for (const index of preferredIndices) {
    const chunk = chunks[index];
    if (!chunk) {
      continue;
    }

    const document = corpusByTitle.get(chunk.title);
    const sourceId = document?.id ?? `source-${index + 1}`;

    if (!seenSourceIds.has(sourceId)) {
      seenSourceIds.add(sourceId);
      sources.push({
        id: sourceId,
        title: document?.title ?? chunk.title,
        ...(document?.relativePath ? { path: document.relativePath } : {}),
      });
    }

    if (excerpts.length < 3) {
      excerpts.push({
        sourceId,
        text: truncateExcerpt(chunk.text),
      });
    }

    if (sources.length >= 3 && excerpts.length >= 3) {
      break;
    }
  }

  return {
    summaryAnswer: normalizedAnswer,
    supportingExcerpts: excerpts,
    sources,
    confidence: sources.length >= 2 ? 'high' : 'medium',
    retrievalStatus: 'grounded',
  };
}
