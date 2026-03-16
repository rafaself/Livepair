import { describe, expect, it } from 'vitest';
import { deriveAnswerMetadataFromGrounding } from './geminiLiveGroundingMetadata';

describe('deriveAnswerMetadataFromGrounding', () => {
  it('returns null when groundingMetadata is null or undefined', () => {
    expect(deriveAnswerMetadataFromGrounding(null)).toBeNull();
    expect(deriveAnswerMetadataFromGrounding(undefined)).toBeNull();
  });

  it('returns null when there are no web chunks and no search queries', () => {
    expect(deriveAnswerMetadataFromGrounding({
      groundingChunks: [],
      groundingSupports: [],
    })).toBeNull();

    expect(deriveAnswerMetadataFromGrounding({
      groundingChunks: [
        // retrievedContext chunks (file search) — not web chunks
        { retrievedContext: { title: 'README.md', uri: 'gs://bucket/README.md' } } as never,
      ],
      groundingSupports: [],
    })).toBeNull();
  });

  it('returns web_grounded with citations and confidence when grounding supports have web chunks', () => {
    const result = deriveAnswerMetadataFromGrounding({
      groundingSupports: [
        {
          segment: { text: 'Latest stable version is 9.1.' },
          groundingChunkIndices: [0],
          confidenceScores: [0.9],
        },
      ],
      groundingChunks: [
        {
          web: {
            title: 'Release notes',
            uri: 'https://example.com/releases',
          },
        },
      ],
      webSearchQueries: ['latest stable version'],
    });

    expect(result).toEqual({
      provenance: 'web_grounded',
      confidence: 'high',
      citations: [
        { label: 'Release notes', uri: 'https://example.com/releases' },
      ],
      reason: 'Derived from Gemini Live grounding metadata with web support.',
    });
  });

  it('deduplicates citations by uri across multiple supports', () => {
    const result = deriveAnswerMetadataFromGrounding({
      groundingSupports: [
        { groundingChunkIndices: [0], confidenceScores: [0.7] },
        { groundingChunkIndices: [0], confidenceScores: [0.8] },
      ],
      groundingChunks: [
        { web: { title: 'Docs page', uri: 'https://example.com/docs' } },
      ],
      webSearchQueries: ['query'],
    });

    expect(result?.provenance).toBe('web_grounded');
    expect(result?.citations).toHaveLength(1);
    expect(result?.citations?.[0]).toEqual({ label: 'Docs page', uri: 'https://example.com/docs' });
  });

  it('returns unverified when search was attempted but no usable support was found', () => {
    const result = deriveAnswerMetadataFromGrounding({
      groundingChunks: [],
      groundingSupports: [],
      webSearchQueries: ['some query'],
    });

    expect(result).toEqual({
      provenance: 'unverified',
      confidence: 'low',
      reason: 'Google Search grounding did not return enough supporting evidence.',
    });
  });

  it('returns unverified when web chunks exist but none map to a valid support', () => {
    const result = deriveAnswerMetadataFromGrounding({
      groundingChunks: [
        { web: { title: 'Some page', uri: 'https://example.com' } },
      ],
      groundingSupports: [],
      webSearchQueries: [],
    });

    // The web chunk signals an attempted search even without explicit queries.
    expect(result).toEqual({
      provenance: 'unverified',
      confidence: 'low',
      reason: 'Google Search grounding did not return enough supporting evidence.',
    });
  });

  it('clips citations to the 3-citation limit', () => {
    const result = deriveAnswerMetadataFromGrounding({
      groundingSupports: [
        { groundingChunkIndices: [0, 1, 2, 3], confidenceScores: [0.8] },
      ],
      groundingChunks: [
        { web: { title: 'Page A', uri: 'https://a.com' } },
        { web: { title: 'Page B', uri: 'https://b.com' } },
        { web: { title: 'Page C', uri: 'https://c.com' } },
        { web: { title: 'Page D', uri: 'https://d.com' } },
      ],
      webSearchQueries: ['query'],
    });

    expect(result?.citations).toHaveLength(3);
  });

  it('derives medium confidence when no confidence scores are present', () => {
    const result = deriveAnswerMetadataFromGrounding({
      groundingSupports: [
        { groundingChunkIndices: [0] },
      ],
      groundingChunks: [
        { web: { title: 'Page', uri: 'https://example.com' } },
      ],
      webSearchQueries: ['query'],
    });

    expect(result?.confidence).toBe('medium');
  });
});
