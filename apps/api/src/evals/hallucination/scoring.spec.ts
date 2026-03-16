import type {
  HallucinationDatasetDocument,
  HallucinationRunArtifact,
} from './types';
import { scoreHallucinationRun } from './scoring';

const DATASET: HallucinationDatasetDocument = {
  schemaVersion: 1,
  datasetId: 'wave5-hallucination-regression-v1',
  cases: [
    {
      id: 'project-token-endpoint',
      bucket: 'project_specific_factual',
      prompt: 'Which endpoint issues ephemeral Gemini Live tokens?',
      expectedPath: 'project_grounded',
      shouldUseProjectRetrieval: true,
      shouldUseWebGrounding: false,
      shouldAbstainOrBeCautious: false,
      reference: 'README.md',
      sourceText: 'Speech mode requests an ephemeral token from POST /session/token.',
      requiredSubstrings: ['POST /session/token'],
      forbiddenSubstrings: ['GET /session/token'],
    },
    {
      id: 'public-grounding-metric',
      bucket: 'public_current_factual',
      prompt: 'Which managed Vertex AI metric checks factuality against provided source text?',
      expectedPath: 'web_grounded',
      shouldUseProjectRetrieval: false,
      shouldUseWebGrounding: true,
      shouldAbstainOrBeCautious: false,
      reference: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/evaluation',
      sourceText: 'GROUNDING checks factuality and consistency against provided source text.',
      requiredSubstrings: ['GROUNDING'],
    },
    {
      id: 'unsupported-private-meeting',
      bucket: 'impossible_or_insufficient',
      prompt: 'What exactly was said in the private 2025 offsite about future monetization?',
      expectedPath: 'unverified',
      shouldUseProjectRetrieval: false,
      shouldUseWebGrounding: false,
      shouldAbstainOrBeCautious: true,
      requiredCautionSubstrings: ['cannot verify'],
    },
  ],
};

describe('scoreHallucinationRun', () => {
  it('scores routing, caution, support presence, and dataset-corrected failures', () => {
    const run: HallucinationRunArtifact = {
      schemaVersion: 1,
      datasetId: DATASET.datasetId,
      runLabel: 'candidate',
      generatedAt: '2026-03-16T00:00:00.000Z',
      results: [
        {
          id: 'project-token-endpoint',
          response: 'The app gets tokens from GET /session/token.',
          answerMetadata: {
            provenance: 'project_grounded',
            citations: [{ label: 'README.md' }],
            confidence: 'high',
          },
          usedProjectRetrieval: true,
          usedWebGrounding: false,
        },
        {
          id: 'public-grounding-metric',
          response: 'Use the GROUNDING metric.',
          answerMetadata: {
            provenance: 'web_grounded',
            citations: [{ label: 'Vertex AI docs', uri: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/evaluation' }],
            confidence: 'high',
          },
          usedProjectRetrieval: false,
          usedWebGrounding: true,
        },
        {
          id: 'unsupported-private-meeting',
          response: 'I cannot verify that from the available evidence.',
          answerMetadata: {
            provenance: 'unverified',
            confidence: 'low',
            reason: 'No verified source was available.',
          },
          usedProjectRetrieval: false,
          usedWebGrounding: false,
        },
      ],
    };

    const scored = scoreHallucinationRun(DATASET, run);

    expect(scored.summary.totalCases).toBe(3);
    expect(scored.summary.groundedAnswerRate).toBeCloseTo(0.5);
    expect(scored.summary.unverifiedRateOnUnsupportedPrompts).toBe(1);
    expect(scored.summary.obviousHallucinationCount).toBe(1);
    expect(scored.summary.incorrectPathCount).toBe(0);
    expect(scored.summary.correctedByDatasetExpectationCount).toBe(1);
    expect(scored.summary.supportPresenceRate).toBeCloseTo(1);
    expect(scored.summary.status).toBe('warning');

    const tokenEndpointCase = scored.caseResults.find(
      (caseResult) => caseResult.id === 'project-token-endpoint',
    );

    expect(tokenEndpointCase).toMatchObject({
      passed: false,
      pathCorrect: true,
      responseChecksPassed: false,
      obviousHallucination: true,
      correctedByDatasetExpectation: true,
    });
  });
});
