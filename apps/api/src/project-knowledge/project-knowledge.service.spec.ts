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

    expect(client.createFileSearchStore).toHaveBeenCalledWith('livepair-project-knowledge');
    expect(client.uploadFile).toHaveBeenCalledTimes(2);
    expect(client.importFile).toHaveBeenCalledTimes(2);
    expect(client.deleteFile).toHaveBeenCalledTimes(2);
    expect(client.generateGroundedAnswer).toHaveBeenCalledWith({
      model: 'models/gemini-2.5-flash',
      query: 'How do live sessions connect?',
      storeName: 'fileSearchStores/livepair-store',
    });
  });

  it('returns a bounded no-match result without invented sources when grounding is absent', async () => {
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
        text: 'I could not verify that from the curated project documents.',
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
});
