import type { AnswerConfidence, AnswerCitation, AnswerMetadata } from '@livepair/shared-types';
import type { GeminiLiveSdkServerMessage } from './geminiLiveSdkClient';

type GeminiLiveServerContent = NonNullable<GeminiLiveSdkServerMessage['serverContent']>;
type GeminiLiveGroundingMetadata = NonNullable<GeminiLiveServerContent['groundingMetadata']>;
type GeminiLiveGroundingChunk = NonNullable<GeminiLiveGroundingMetadata['groundingChunks']>[number];
type GeminiLiveGroundingSupport = NonNullable<GeminiLiveGroundingMetadata['groundingSupports']>[number];

const GROUNDING_CITATION_LIMIT = 3;

function normalizeGroundingCitation(
  chunk: GeminiLiveGroundingChunk | undefined,
): AnswerCitation | null {
  const webChunk = chunk?.web;

  if (!webChunk) {
    return null;
  }

  const label = webChunk.title?.trim() || webChunk.uri?.trim();

  if (!label) {
    return null;
  }

  return {
    label,
    ...(webChunk.uri?.trim() ? { uri: webChunk.uri.trim() } : {}),
  };
}

function deriveGroundingConfidence(
  supports: GeminiLiveGroundingSupport[],
): AnswerConfidence {
  const confidenceScores = supports
    .flatMap((support) => support.confidenceScores ?? [])
    .filter((score) => Number.isFinite(score));

  if (confidenceScores.length === 0) {
    return 'medium';
  }

  const maxConfidence = Math.max(...confidenceScores);

  if (maxConfidence >= 0.85) {
    return 'high';
  }

  if (maxConfidence >= 0.6) {
    return 'medium';
  }

  return 'low';
}

export function deriveAnswerMetadataFromGrounding(
  groundingMetadata: GeminiLiveGroundingMetadata | null | undefined,
): AnswerMetadata | null {
  if (!groundingMetadata) {
    return null;
  }

  const groundingChunks = groundingMetadata.groundingChunks ?? [];
  const supportingWebEntries = (groundingMetadata.groundingSupports ?? [])
    .map((support) => {
      const indices = support.groundingChunkIndices ?? [];
      const citations = indices
        .map((index) => normalizeGroundingCitation(groundingChunks[index]))
        .filter((citation): citation is AnswerCitation => citation !== null);

      if (citations.length === 0) {
        return null;
      }

      return {
        support,
        citations,
      };
    })
    .filter((entry): entry is {
      support: GeminiLiveGroundingSupport;
      citations: AnswerCitation[];
    } => entry !== null);

  if (supportingWebEntries.length > 0) {
    const citations = supportingWebEntries
      .flatMap((entry) => entry.citations)
      .filter((citation, index, allCitations) =>
        allCitations.findIndex((candidate) =>
          candidate.uri
            ? candidate.uri === citation.uri
            : candidate.label === citation.label) === index)
      .slice(0, GROUNDING_CITATION_LIMIT);

    return {
      provenance: 'web_grounded',
      confidence: deriveGroundingConfidence(supportingWebEntries.map((entry) => entry.support)),
      citations,
      reason: 'Derived from Gemini Live grounding metadata with web support.',
    };
  }

  const attemptedWebGrounding =
    (groundingMetadata.webSearchQueries?.length ?? 0) > 0
    || groundingChunks.some((chunk) => chunk.web);

  if (!attemptedWebGrounding) {
    return null;
  }

  return {
    provenance: 'unverified',
    confidence: 'low',
    reason: 'Google Search grounding did not return enough supporting evidence.',
  };
}
