import { Injectable } from '@nestjs/common';
import type {
  AnswerMetadata,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
  ProjectKnowledgeSourceReference,
  ProjectKnowledgeSupportingExcerpt,
} from '@livepair/shared-types';
import { env } from '../config/env';
import type { ProjectKnowledgeCorpusDocument } from './project-knowledge-corpus';
import { ProjectKnowledgeCorpusService } from './project-knowledge-corpus.service';
import { ProjectKnowledgeGeminiClient } from './project-knowledge-gemini.client';

type GroundingChunk = {
  title: string;
  text: string;
};

type GroundingSupport = {
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

function normalizeGroundingChunks(value: unknown): GroundingChunk[] {
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

function normalizeGroundingSupports(value: unknown): GroundingSupport[] {
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

const UNSUPPORTED_RETRIEVAL_ANSWER = 'I could not verify that from the curated project documents.';

function truncateExcerpt(text: string, maxLength = 220): string {
  const trimmed = text.trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

function buildNoMatchResult(
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

function buildFailedResult(
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

function buildCorpusIndex(
  corpus: readonly ProjectKnowledgeCorpusDocument[],
): Map<string, ProjectKnowledgeCorpusDocument> {
  return new Map(corpus.map((document) => [document.title, document]));
}

function buildAnswerMetadata(result: ProjectKnowledgeSearchResult): AnswerMetadata | null {
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

@Injectable()
export class ProjectKnowledgeService {
  private lastSyncedSignature: string | null = null;
  private lastSyncedStoreName: string | null = null;
  private syncPromise: Promise<string> | null = null;

  constructor(
    private readonly projectKnowledgeClient: ProjectKnowledgeGeminiClient,
    private readonly projectKnowledgeCorpusService: ProjectKnowledgeCorpusService,
  ) {}

  async searchProjectKnowledge(
    request: ProjectKnowledgeSearchRequest,
  ): Promise<ProjectKnowledgeSearchResult> {
    if (!env.geminiApiKey.trim()) {
      return buildFailedResult('not_ready', 'gemini_api_key_missing');
    }

    if (!env.projectKnowledgeSearchModel.trim()) {
      return buildFailedResult('not_ready', 'project_knowledge_model_missing');
    }

    try {
      const corpus = await this.projectKnowledgeCorpusService.listDocuments();
      const storeName = await this.ensureCorpusReady(corpus);
      const groundedAnswer = await this.projectKnowledgeClient.generateGroundedAnswer(
        env.geminiApiKey,
        {
          model: env.projectKnowledgeSearchModel,
          query: request.query,
          storeName,
        },
      );

      return this.buildSearchResult(groundedAnswer.text, groundedAnswer.groundingMetadata, corpus);
    } catch (error) {
      const failureReason = error instanceof Error && error.message.length > 0
        ? error.message
        : 'project_knowledge_retrieval_failed';

      return buildFailedResult('failed', failureReason);
    }
  }

  deriveAnswerMetadata(result: ProjectKnowledgeSearchResult): AnswerMetadata | null {
    return buildAnswerMetadata(result);
  }

  private async ensureCorpusReady(
    corpus: readonly ProjectKnowledgeCorpusDocument[],
  ): Promise<string> {
    const signature = corpus
      .map((document) => `${document.id}:${document.contentHash}`)
      .join('|');

    const existingSync = this.syncPromise;
    if (existingSync) {
      return existingSync;
    }

    if (signature === this.lastSyncedSignature && this.lastSyncedStoreName) {
      return this.lastSyncedStoreName;
    }

    this.syncPromise = this.syncCorpus(corpus, signature).finally(() => {
      this.syncPromise = null;
    });

    return this.syncPromise;
  }

  private async syncCorpus(
    corpus: readonly ProjectKnowledgeCorpusDocument[],
    signature: string,
  ): Promise<string> {
    const store = await this.resolveStore();
    const existingDocuments = await this.projectKnowledgeClient.listDocuments(
      env.geminiApiKey,
      store.name,
    );
    const managedDocuments = existingDocuments.filter(
      (document) => document.customMetadata['managed_by'] === 'livepair-project-knowledge',
    );
    const existingByPath = new Map(
      managedDocuments.map((document) => [
        document.customMetadata['source_path'] ?? document.displayName,
        document,
      ]),
    );
    const manifestPaths = new Set(corpus.map((document) => document.relativePath));

    for (const document of managedDocuments) {
      const sourcePath = document.customMetadata['source_path'];
      if (sourcePath && !manifestPaths.has(sourcePath)) {
        await this.projectKnowledgeClient.deleteDocument(env.geminiApiKey, document.name);
      }
    }

    for (const document of corpus) {
      const existing = existingByPath.get(document.relativePath);
      const isUpToDate = existing
        && existing.customMetadata['content_hash'] === document.contentHash
        && existing.state === 'STATE_ACTIVE';

      if (isUpToDate) {
        continue;
      }

      if (existing) {
        await this.projectKnowledgeClient.deleteDocument(env.geminiApiKey, existing.name);
      }

      const uploadedFile = await this.projectKnowledgeClient.uploadFile(env.geminiApiKey, document);
      try {
        await this.projectKnowledgeClient.importFile(
          env.geminiApiKey,
          store.name,
          uploadedFile.name,
          document,
        );
      } finally {
        try {
          await this.projectKnowledgeClient.deleteFile(env.geminiApiKey, uploadedFile.name);
        } catch {
          // File API uploads are temporary, but we still try to clean them up.
        }
      }
    }

    this.lastSyncedSignature = signature;
    this.lastSyncedStoreName = store.name;

    return store.name;
  }

  private async resolveStore(): Promise<{
    name: string;
    displayName: string;
  }> {
    const configuredStore = env.projectKnowledgeFileSearchStore.trim();
    if (configuredStore) {
      return {
        name: configuredStore,
        displayName: env.projectKnowledgeFileSearchStoreDisplayName,
      };
    }

    const stores = await this.projectKnowledgeClient.listFileSearchStores(env.geminiApiKey);
    const existing = stores.find(
      (store) => store.displayName === env.projectKnowledgeFileSearchStoreDisplayName,
    );

    if (existing) {
      return existing;
    }

    return this.projectKnowledgeClient.createFileSearchStore(
      env.geminiApiKey,
      env.projectKnowledgeFileSearchStoreDisplayName,
    );
  }

  private buildSearchResult(
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
}
