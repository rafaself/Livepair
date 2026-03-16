import 'reflect-metadata';
import {
  UNSUPPORTED_RETRIEVAL_ANSWER,
  buildAnswerMetadata,
  buildFailedResult,
  buildNoMatchResult,
  buildSearchResult,
  normalizeGroundingChunks,
  normalizeGroundingSupports,
} from './project-knowledge-result-builder';

const CORPUS = [
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
];

describe('normalizeGroundingChunks', () => {
  it('returns empty array for null, undefined, or non-object input', () => {
    expect(normalizeGroundingChunks(null)).toEqual([]);
    expect(normalizeGroundingChunks(undefined)).toEqual([]);
    expect(normalizeGroundingChunks('string')).toEqual([]);
    expect(normalizeGroundingChunks(42)).toEqual([]);
  });

  it('returns empty array when groundingChunks key is missing', () => {
    expect(normalizeGroundingChunks({})).toEqual([]);
    expect(normalizeGroundingChunks({ other: 'key' })).toEqual([]);
  });

  it('returns empty array when groundingChunks is empty', () => {
    expect(normalizeGroundingChunks({ groundingChunks: [] })).toEqual([]);
  });

  it('skips chunks missing retrievedContext or required fields', () => {
    expect(normalizeGroundingChunks({
      groundingChunks: [
        null,
        {},
        { retrievedContext: {} },
        { retrievedContext: { title: '' } },
        { retrievedContext: { title: 'Title', text: '' } },
        { web: { title: 'Web title' } }, // web chunk, not retrievedContext
      ],
    })).toEqual([]);
  });

  it('extracts and trims valid retrievedContext chunks', () => {
    expect(normalizeGroundingChunks({
      groundingChunks: [
        { retrievedContext: { title: '  docs/ARCHITECTURE.md  ', text: '  Some content  ' } },
        { retrievedContext: { title: 'AGENTS.md', text: 'Agent rules' } },
      ],
    })).toEqual([
      { title: 'docs/ARCHITECTURE.md', text: 'Some content' },
      { title: 'AGENTS.md', text: 'Agent rules' },
    ]);
  });
});

describe('normalizeGroundingSupports', () => {
  it('returns empty array for missing or invalid input', () => {
    expect(normalizeGroundingSupports(null)).toEqual([]);
    expect(normalizeGroundingSupports({})).toEqual([]);
    expect(normalizeGroundingSupports({ groundingSupports: 'not-array' })).toEqual([]);
  });

  it('returns empty array when groundingSupports is empty', () => {
    expect(normalizeGroundingSupports({ groundingSupports: [] })).toEqual([]);
  });

  it('skips supports with empty or invalid indices', () => {
    expect(normalizeGroundingSupports({
      groundingSupports: [
        {},
        { groundingChunkIndices: [] },
        { groundingChunkIndices: ['a', 'b'] },
        { groundingChunkIndices: [-1, -2] },
        { groundingChunkIndices: [1.5, 2.7] },
      ],
    })).toEqual([]);
  });

  it('extracts valid non-negative integer indices', () => {
    expect(normalizeGroundingSupports({
      groundingSupports: [
        { groundingChunkIndices: [0, 1] },
        { groundingChunkIndices: [2] },
      ],
    })).toEqual([
      { groundingChunkIndices: [0, 1] },
      { groundingChunkIndices: [2] },
    ]);
  });
});

describe('buildNoMatchResult', () => {
  it('returns a no_match result with low confidence and empty evidence', () => {
    expect(buildNoMatchResult(UNSUPPORTED_RETRIEVAL_ANSWER, 'no_grounding_chunks')).toEqual({
      summaryAnswer: UNSUPPORTED_RETRIEVAL_ANSWER,
      supportingExcerpts: [],
      sources: [],
      confidence: 'low',
      retrievalStatus: 'no_match',
      failureReason: 'no_grounding_chunks',
    });
  });
});

describe('buildFailedResult', () => {
  it('always uses the safe fallback answer for failed and not_ready statuses', () => {
    const failed = buildFailedResult('failed', 'api_error');
    expect(failed.summaryAnswer).toBe(UNSUPPORTED_RETRIEVAL_ANSWER);
    expect(failed.retrievalStatus).toBe('failed');
    expect(failed.sources).toEqual([]);
    expect(failed.supportingExcerpts).toEqual([]);

    const notReady = buildFailedResult('not_ready', 'gemini_api_key_missing');
    expect(notReady.summaryAnswer).toBe(UNSUPPORTED_RETRIEVAL_ANSWER);
    expect(notReady.retrievalStatus).toBe('not_ready');
  });
});

describe('buildSearchResult', () => {
  it('returns no_match with safe answer when grounding chunks are absent', () => {
    const result = buildSearchResult('Model invented this answer.', {
      groundingChunks: [],
      groundingSupports: [],
    }, CORPUS);

    expect(result).toEqual({
      summaryAnswer: UNSUPPORTED_RETRIEVAL_ANSWER,
      supportingExcerpts: [],
      sources: [],
      confidence: 'low',
      retrievalStatus: 'no_match',
      failureReason: 'no_grounding_chunks',
    });
  });

  it('returns no_match with safe answer when chunks exist but supports are absent', () => {
    const result = buildSearchResult('Model invented this answer.', {
      groundingChunks: [
        { retrievedContext: { title: 'docs/ARCHITECTURE.md', text: 'Some architecture text.' } },
      ],
      groundingSupports: [],
    }, CORPUS);

    expect(result).toEqual({
      summaryAnswer: UNSUPPORTED_RETRIEVAL_ANSWER,
      supportingExcerpts: [],
      sources: [],
      confidence: 'low',
      retrievalStatus: 'no_match',
      failureReason: 'no_grounding_supports',
    });
  });

  it('returns grounded result with high confidence for 2+ supported sources', () => {
    const result = buildSearchResult(
      'Speech mode uses POST /session/token for tokens.',
      {
        groundingChunks: [
          { retrievedContext: { title: 'docs/ARCHITECTURE.md', text: 'Architecture excerpt.' } },
          { retrievedContext: { title: 'AGENTS.md', text: 'Agents excerpt.' } },
        ],
        groundingSupports: [
          { groundingChunkIndices: [0, 1] },
        ],
      },
      CORPUS,
    );

    expect(result).toEqual({
      summaryAnswer: 'Speech mode uses POST /session/token for tokens.',
      supportingExcerpts: [
        { sourceId: 'architecture', text: 'Architecture excerpt.' },
        { sourceId: 'root-agents', text: 'Agents excerpt.' },
      ],
      sources: [
        { id: 'architecture', title: 'docs/ARCHITECTURE.md', path: 'docs/ARCHITECTURE.md' },
        { id: 'root-agents', title: 'AGENTS.md', path: 'AGENTS.md' },
      ],
      confidence: 'high',
      retrievalStatus: 'grounded',
    });
  });

  it('returns medium confidence for a single supported source', () => {
    const result = buildSearchResult('Architecture answer.', {
      groundingChunks: [
        { retrievedContext: { title: 'docs/ARCHITECTURE.md', text: 'Architecture excerpt.' } },
      ],
      groundingSupports: [{ groundingChunkIndices: [0] }],
    }, CORPUS);

    expect(result.confidence).toBe('medium');
    expect(result.retrievalStatus).toBe('grounded');
  });

  it('uses safe fallback answer when answerText is empty but grounding supports are valid', () => {
    const result = buildSearchResult('', {
      groundingChunks: [
        { retrievedContext: { title: 'docs/ARCHITECTURE.md', text: 'Content.' } },
      ],
      groundingSupports: [{ groundingChunkIndices: [0] }],
    }, CORPUS);

    expect(result.summaryAnswer).toBe(UNSUPPORTED_RETRIEVAL_ANSWER);
    expect(result.retrievalStatus).toBe('grounded');
  });

  it('does not assign sources from outside the corpus to fallback ids', () => {
    const result = buildSearchResult('Answer with unknown doc.', {
      groundingChunks: [
        { retrievedContext: { title: 'unknown-file.md', text: 'Some text.' } },
      ],
      groundingSupports: [{ groundingChunkIndices: [0] }],
    }, CORPUS);

    expect(result.sources[0]).toMatchObject({
      id: 'source-1',
      title: 'unknown-file.md',
    });
    expect(result.sources[0]).not.toHaveProperty('path');
  });
});

describe('buildAnswerMetadata', () => {
  it('returns null for non-grounded statuses', () => {
    expect(buildAnswerMetadata(buildNoMatchResult(UNSUPPORTED_RETRIEVAL_ANSWER, 'no_grounding_chunks'))).toBeNull();
    expect(buildAnswerMetadata(buildFailedResult('failed', 'error'))).toBeNull();
    expect(buildAnswerMetadata(buildFailedResult('not_ready', 'missing_key'))).toBeNull();
  });

  it('returns project_grounded metadata with citations for grounded results', () => {
    const result = buildSearchResult(
      'Answer from docs.',
      {
        groundingChunks: [
          { retrievedContext: { title: 'docs/ARCHITECTURE.md', text: 'Content.' } },
        ],
        groundingSupports: [{ groundingChunkIndices: [0] }],
      },
      CORPUS,
    );

    expect(buildAnswerMetadata(result)).toEqual({
      provenance: 'project_grounded',
      citations: [{ label: 'docs/ARCHITECTURE.md' }],
      confidence: 'medium',
      reason: 'Derived from successful project knowledge retrieval.',
    });
  });
});
