import { Injectable, OnModuleInit } from '@nestjs/common';
import type {
  AnswerMetadata,
  ProjectKnowledgeSearchRequest,
  ProjectKnowledgeSearchResult,
} from '@livepair/shared-types';
import { env } from '../config/env';
import type { ProjectKnowledgeCorpusDocument } from './project-knowledge-corpus';
import { ProjectKnowledgeCorpusService } from './project-knowledge-corpus.service';
import { ProjectKnowledgeGeminiClient } from './project-knowledge-gemini.client';
import {
  buildAnswerMetadata,
  buildFailedResult,
  buildSearchResult,
} from './project-knowledge-result-builder';

@Injectable()
export class ProjectKnowledgeService implements OnModuleInit {
  private lastSyncedSignature: string | null = null;
  private lastSyncedStoreName: string | null = null;
  private syncPromise: Promise<string> | null = null;

  constructor(
    private readonly projectKnowledgeClient: ProjectKnowledgeGeminiClient,
    private readonly projectKnowledgeCorpusService: ProjectKnowledgeCorpusService,
  ) {}

  onModuleInit(): void {
    // Start corpus sync eagerly so the first user query does not absorb the full
    // store-resolve + upload + import + poll sequence.
    // Failures are tolerated — on-demand sync remains as the fallback.
    void this.prewarmCorpus();
  }

  async prewarmCorpus(): Promise<void> {
    if (
      !env.projectKnowledgePrewarmEnabled
      || !env.geminiApiKey.trim()
      || !env.projectKnowledgeSearchModel.trim()
    ) {
      return;
    }

    try {
      const corpus = await this.projectKnowledgeCorpusService.listDocuments();
      await this.ensureCorpusReady(corpus);
    } catch {
      // Prewarm is best-effort; on-demand sync remains as the fallback.
    }
  }

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

      return buildSearchResult(groundedAnswer.text, groundedAnswer.groundingMetadata, corpus);
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
}
