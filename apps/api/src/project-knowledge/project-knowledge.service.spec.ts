import 'reflect-metadata';

jest.mock('../config/loadRootEnv', () => ({}));

describe('ProjectKnowledgeService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      PROJECT_KNOWLEDGE_SEARCH_MODEL: 'models/gemini-2.5-flash',
      PROJECT_KNOWLEDGE_FILE_SEARCH_STORE_DISPLAY_NAME: 'livepair-project-knowledge',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('prewarmCorpus skips sync by default until explicitly enabled', async () => {
    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = {
      listDocuments: jest.fn(async () => []),
    };
    const client = {
      listFileSearchStores: jest.fn(async () => [
        {
          name: 'fileSearchStores/livepair-store',
          displayName: 'livepair-project-knowledge',
        },
      ]),
      createFileSearchStore: jest.fn(),
      listDocuments: jest.fn(async () => []),
      uploadFile: jest.fn(),
      importFile: jest.fn(),
      deleteFile: jest.fn(),
      deleteDocument: jest.fn(),
      generateGroundedAnswer: jest.fn(),
    };

    const service = new ProjectKnowledgeService(client as never, corpusService as never);
    await service.prewarmCorpus();

    expect(corpusService.listDocuments).not.toHaveBeenCalled();
    expect(client.listFileSearchStores).not.toHaveBeenCalled();
    expect(client.listDocuments).not.toHaveBeenCalled();
    expect(client.generateGroundedAnswer).not.toHaveBeenCalled();
  });

  it('prewarmCorpus starts corpus sync eagerly when explicitly enabled', async () => {
    process.env['PROJECT_KNOWLEDGE_PREWARM_ENABLED'] = 'true';

    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = {
      listDocuments: jest.fn(async () => []),
    };
    const client = {
      listFileSearchStores: jest.fn(async () => [
        {
          name: 'fileSearchStores/livepair-store',
          displayName: 'livepair-project-knowledge',
        },
      ]),
      createFileSearchStore: jest.fn(),
      listDocuments: jest.fn(async () => []),
      uploadFile: jest.fn(),
      importFile: jest.fn(),
      deleteFile: jest.fn(),
      deleteDocument: jest.fn(),
      generateGroundedAnswer: jest.fn(),
    };

    const service = new ProjectKnowledgeService(client as never, corpusService as never);
    await service.prewarmCorpus();

    expect(client.listFileSearchStores).toHaveBeenCalledTimes(1);
    expect(client.listDocuments).toHaveBeenCalledTimes(1);
    expect(client.generateGroundedAnswer).not.toHaveBeenCalled();
  });

  it('prewarmCorpus skips sync when config is not ready', async () => {
    process.env = {
      ...process.env,
      GEMINI_API_KEY: '',
    };

    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = { listDocuments: jest.fn() };
    const client = { listFileSearchStores: jest.fn() };

    const service = new ProjectKnowledgeService(client as never, corpusService as never);
    await service.prewarmCorpus();

    expect(corpusService.listDocuments).not.toHaveBeenCalled();
    expect(client.listFileSearchStores).not.toHaveBeenCalled();
  });

  it('prewarmCorpus swallows sync errors so module init is not disrupted', async () => {
    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = {
      listDocuments: jest.fn(async () => {
        throw new Error('corpus unavailable during prewarm');
      }),
    };
    const client = { listFileSearchStores: jest.fn() };

    const service = new ProjectKnowledgeService(client as never, corpusService as never);
    await expect(service.prewarmCorpus()).resolves.toBeUndefined();
  });

  it('syncs missing corpus entries and derives compact grounded evidence from File Search output', async () => {
    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = {
      listDocuments: jest.fn(async () => [
        {
          id: 'architecture',
          title: 'docs/ARCHITECTURE.md',
          relativePath: 'docs/ARCHITECTURE.md',
          absolutePath: '/repo/docs/ARCHITECTURE.md',
          mimeType: 'text/markdown',
          contentHash: 'hash-architecture',
        },
        {
          id: 'root-agents',
          title: 'AGENTS.md',
          relativePath: 'AGENTS.md',
          absolutePath: '/repo/AGENTS.md',
          mimeType: 'text/markdown',
          contentHash: 'hash-agents',
        },
      ]),
    };
    const client = {
      listFileSearchStores: jest.fn(async () => []),
      createFileSearchStore: jest.fn(async () => ({
        name: 'fileSearchStores/livepair-store',
        displayName: 'livepair-project-knowledge',
      })),
      listDocuments: jest.fn(async () => []),
      uploadFile: jest.fn(async ({ displayName }: { displayName: string }) => ({
        name: `files/${displayName}`,
      })),
      importFile: jest.fn(async () => undefined),
      deleteFile: jest.fn(async () => undefined),
      deleteDocument: jest.fn(async () => undefined),
      generateGroundedAnswer: jest.fn(async () => ({
        text: 'Live sessions connect from desktop to Gemini Live after the backend issues an ephemeral token.',
        groundingMetadata: {
          groundingChunks: [
            {
              retrievedContext: {
                title: 'docs/ARCHITECTURE.md',
                text: 'Speech mode requests an ephemeral token from POST /session/token, then connects directly from the desktop to Gemini Live.',
              },
            },
            {
              retrievedContext: {
                title: 'AGENTS.md',
                text: 'Speech mode stays desktop -> Gemini Live; do not add backend audio/video proxying.',
              },
            },
          ],
          groundingSupports: [
            {
              groundingChunkIndices: [0, 1],
              segment: {
                startIndex: 0,
                endIndex: 97,
                text: 'Live sessions connect from desktop to Gemini Live after the backend issues an ephemeral token.',
              },
            },
          ],
        },
      })),
    };

    const service = new ProjectKnowledgeService(
      client as never,
      corpusService as never,
    );

    await expect(
      service.searchProjectKnowledge({
        query: 'How do live sessions connect?',
      }),
    ).resolves.toEqual({
      summaryAnswer:
        'Live sessions connect from desktop to Gemini Live after the backend issues an ephemeral token.',
      supportingExcerpts: [
        {
          sourceId: 'architecture',
          text: 'Speech mode requests an ephemeral token from POST /session/token, then connects directly from the desktop to Gemini Live.',
        },
        {
          sourceId: 'root-agents',
          text: 'Speech mode stays desktop -> Gemini Live; do not add backend audio/video proxying.',
        },
      ],
      sources: [
        {
          id: 'architecture',
          title: 'docs/ARCHITECTURE.md',
          path: 'docs/ARCHITECTURE.md',
        },
        {
          id: 'root-agents',
          title: 'AGENTS.md',
          path: 'AGENTS.md',
        },
      ],
      confidence: 'high',
      retrievalStatus: 'grounded',
    });

    expect(client.createFileSearchStore).toHaveBeenCalledWith(
      'gemini-key',
      'livepair-project-knowledge',
    );
    expect(client.uploadFile).toHaveBeenCalledTimes(2);
    expect(client.importFile).toHaveBeenCalledTimes(2);
    expect(client.deleteFile).toHaveBeenCalledTimes(2);
    expect(client.generateGroundedAnswer).toHaveBeenCalledWith(
      'gemini-key',
      {
        model: 'models/gemini-2.5-flash',
        query: 'How do live sessions connect?',
        storeName: 'fileSearchStores/livepair-store',
      },
    );
  });

  it('returns bounded no-match without leaking model text when grounding chunks are absent', async () => {
    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = {
      listDocuments: jest.fn(async () => []),
    };
    const client = {
      listFileSearchStores: jest.fn(async () => [
        {
          name: 'fileSearchStores/livepair-store',
          displayName: 'livepair-project-knowledge',
        },
      ]),
      createFileSearchStore: jest.fn(),
      listDocuments: jest.fn(async () => []),
      uploadFile: jest.fn(),
      importFile: jest.fn(),
      deleteFile: jest.fn(),
      deleteDocument: jest.fn(),
      generateGroundedAnswer: jest.fn(async () => ({
        // Model produced plausible-sounding free text — no grounding chunks back it.
        text: 'The secret feature is enabled by setting ENABLE_SECRET=true in your .env file.',
        groundingMetadata: {
          groundingChunks: [],
          groundingSupports: [],
        },
      })),
    };

    const service = new ProjectKnowledgeService(
      client as never,
      corpusService as never,
    );

    await expect(
      service.searchProjectKnowledge({
        query: 'What undocumented secret feature exists?',
      }),
    ).resolves.toEqual({
      summaryAnswer: 'I could not verify that from the curated project documents.',
      supportingExcerpts: [],
      sources: [],
      confidence: 'low',
      retrievalStatus: 'no_match',
      failureReason: 'no_grounding_chunks',
    });
  });

  it('returns bounded no-match without leaking model text when grounding supports are absent', async () => {
    const { ProjectKnowledgeService } = await import('./project-knowledge.service');

    const corpusService = {
      listDocuments: jest.fn(async () => [
        {
          id: 'architecture',
          title: 'docs/ARCHITECTURE.md',
          relativePath: 'docs/ARCHITECTURE.md',
          absolutePath: '/repo/docs/ARCHITECTURE.md',
          mimeType: 'text/markdown',
          contentHash: 'hash-architecture',
        },
      ]),
    };
    const client = {
      listFileSearchStores: jest.fn(async () => [
        {
          name: 'fileSearchStores/livepair-store',
          displayName: 'livepair-project-knowledge',
        },
      ]),
      createFileSearchStore: jest.fn(),
      listDocuments: jest.fn(async () => []),
      uploadFile: jest.fn(async ({ displayName }: { displayName: string }) => ({
        name: `files/${displayName}`,
      })),
      importFile: jest.fn(async () => undefined),
      deleteFile: jest.fn(async () => undefined),
      deleteDocument: jest.fn(async () => undefined),
      generateGroundedAnswer: jest.fn(async () => ({
        // Chunks were retrieved but no groundingSupports link them to the answer text.
        text: 'The architecture uses a monolithic backend with direct DB access.',
        groundingMetadata: {
          groundingChunks: [
            {
              retrievedContext: {
                title: 'docs/ARCHITECTURE.md',
                text: 'Speech mode stays desktop -> Gemini Live; do not add backend audio/video proxying.',
              },
            },
          ],
          groundingSupports: [],
        },
      })),
    };

    const service = new ProjectKnowledgeService(
      client as never,
      corpusService as never,
    );

    await expect(
      service.searchProjectKnowledge({
        query: 'How is the backend structured?',
      }),
    ).resolves.toEqual({
      summaryAnswer: 'I could not verify that from the curated project documents.',
      supportingExcerpts: [],
      sources: [],
      confidence: 'low',
      retrievalStatus: 'no_match',
      failureReason: 'no_grounding_supports',
    });
  });
});
