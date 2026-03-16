import {
  PROJECT_KNOWLEDGE_CORPUS_MANIFEST,
  buildProjectKnowledgeCorpus,
} from './project-knowledge-corpus';

describe('project knowledge corpus manifest', () => {
  it('keeps the curated corpus explicit and small', () => {
    expect(PROJECT_KNOWLEDGE_CORPUS_MANIFEST.map((entry) => entry.relativePath)).toEqual([
      'README.md',
      'WATCHOUTS.md',
      'AGENTS.md',
      'docs/ARCHITECTURE.md',
      'docs/AUDIT.md',
      'docs/MILESTONE_MATRIX.md',
      'docs/GEMINI_LIVE_PREFERENCES_AUDIT.md',
      'apps/api/AGENTS.md',
      'apps/desktop/AGENTS.md',
      'packages/shared-types/AGENTS.md',
    ]);
  });

  it('resolves manifest entries into stable corpus documents', async () => {
    const corpus = await buildProjectKnowledgeCorpus();

    expect(corpus).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'repo-readme',
          title: 'README.md',
          relativePath: 'README.md',
          mimeType: 'text/markdown',
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          id: 'root-agents',
          title: 'AGENTS.md',
          relativePath: 'AGENTS.md',
          mimeType: 'text/markdown',
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
        expect.objectContaining({
          id: 'architecture',
          title: 'docs/ARCHITECTURE.md',
          relativePath: 'docs/ARCHITECTURE.md',
          mimeType: 'text/markdown',
          contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        }),
      ]),
    );
  });
});
