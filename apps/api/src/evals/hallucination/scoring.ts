import type { AnswerProvenance } from '@livepair/shared-types';
import type {
  HallucinationCaseScore,
  HallucinationDatasetCase,
  HallucinationDatasetDocument,
  HallucinationRunArtifact,
  HallucinationRunResult,
  HallucinationScoredArtifact,
  HallucinationScoreSummary,
  HallucinationThresholds,
} from './types';
import {
  DEFAULT_HALLUCINATION_THRESHOLDS,
  determineHallucinationStatus,
} from './summary';

const DEFAULT_CAUTION_MARKERS = [
  'cannot verify',
  "can't verify",
  'can’t verify',
  'not enough information',
  'not enough evidence',
  'not documented',
  'not specified',
  'need more context',
  'depends',
  'unclear',
  'not sure',
  "don't know",
];

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function includesAllSubstrings(response: string, requiredSubstrings: string[] | undefined): boolean {
  if (!requiredSubstrings || requiredSubstrings.length === 0) {
    return true;
  }

  const normalizedResponse = normalizeText(response);
  return requiredSubstrings.every((substring) => normalizedResponse.includes(normalizeText(substring)));
}

function includesForbiddenSubstring(response: string, forbiddenSubstrings: string[] | undefined): boolean {
  if (!forbiddenSubstrings || forbiddenSubstrings.length === 0) {
    return false;
  }

  const normalizedResponse = normalizeText(response);
  return forbiddenSubstrings.some((substring) => normalizedResponse.includes(normalizeText(substring)));
}

function inferProjectRetrievalUsage(result: HallucinationRunResult): boolean {
  if (typeof result.usedProjectRetrieval === 'boolean') {
    return result.usedProjectRetrieval;
  }

  return result.answerMetadata?.provenance === 'project_grounded';
}

function inferWebGroundingUsage(result: HallucinationRunResult): boolean {
  if (typeof result.usedWebGrounding === 'boolean') {
    return result.usedWebGrounding;
  }

  if (result.answerMetadata?.provenance === 'web_grounded') {
    return true;
  }

  return result.answerMetadata?.reason?.includes('Google Search grounding') ?? false;
}

function hasSourceSupport(result: HallucinationRunResult): boolean {
  return (
    (result.answerMetadata?.citations?.length ?? 0) > 0
    || (result.supportingEvidence?.length ?? 0) > 0
  );
}

function isCautiousResponse(
  testCase: HallucinationDatasetCase,
  result: HallucinationRunResult,
): boolean {
  if (!testCase.shouldAbstainOrBeCautious) {
    return true;
  }

  if (result.answerMetadata?.provenance === 'unverified') {
    return true;
  }

  const normalizedResponse = normalizeText(result.response);
  const explicitMarkers = testCase.requiredCautionSubstrings ?? DEFAULT_CAUTION_MARKERS;

  return explicitMarkers.some((marker) => normalizedResponse.includes(normalizeText(marker)));
}

function buildCaseScore(
  testCase: HallucinationDatasetCase,
  result: HallucinationRunResult,
): HallucinationCaseScore {
  const actualPath: AnswerProvenance | null = result.answerMetadata?.provenance ?? null;
  const pathCorrect = actualPath === testCase.expectedPath;
  const projectRetrievalCorrect =
    inferProjectRetrievalUsage(result) === testCase.shouldUseProjectRetrieval;
  const webGroundingCorrect = inferWebGroundingUsage(result) === testCase.shouldUseWebGrounding;
  const responseChecksPassed =
    includesAllSubstrings(result.response, testCase.requiredSubstrings)
    && !includesForbiddenSubstring(result.response, testCase.forbiddenSubstrings);
  const cautionSatisfied = isCautiousResponse(testCase, result);
  const sourceSupportPresent = hasSourceSupport(result);
  const simpleExpectationPass = pathCorrect && projectRetrievalCorrect && webGroundingCorrect;

  const obviousHallucination =
    (
      testCase.shouldAbstainOrBeCautious
      && (!cautionSatisfied || actualPath !== 'unverified')
    )
    || (
      testCase.expectedPath !== 'unverified'
      && actualPath === testCase.expectedPath
      && !responseChecksPassed
    );

  const failureReasons: string[] = [];

  if (!pathCorrect) {
    failureReasons.push('incorrect_path');
  }
  if (!projectRetrievalCorrect) {
    failureReasons.push('incorrect_project_retrieval_flag');
  }
  if (!webGroundingCorrect) {
    failureReasons.push('incorrect_web_grounding_flag');
  }
  if (!cautionSatisfied) {
    failureReasons.push('missing_caution');
  }
  if (!responseChecksPassed) {
    failureReasons.push('response_check_failed');
  }

  const passed = simpleExpectationPass && cautionSatisfied && responseChecksPassed;

  return {
    id: testCase.id,
    bucket: testCase.bucket,
    expectedPath: testCase.expectedPath,
    actualPath,
    passed,
    pathCorrect,
    projectRetrievalCorrect,
    webGroundingCorrect,
    cautionSatisfied,
    responseChecksPassed,
    sourceSupportPresent,
    obviousHallucination,
    correctedByDatasetExpectation: simpleExpectationPass !== passed,
    failureReasons,
  };
}

function roundRate(value: number): number {
  return Number(value.toFixed(4));
}

function summarizeScores(
  dataset: HallucinationDatasetDocument,
  caseResults: HallucinationCaseScore[],
  thresholds: HallucinationThresholds,
): HallucinationScoreSummary {
  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((caseResult) => caseResult.passed).length;
  const groundedCaseCount = dataset.cases.filter((testCase) => testCase.expectedPath !== 'unverified').length;
  const unsupportedCaseCount = dataset.cases.filter(
    (testCase) => testCase.shouldAbstainOrBeCautious || testCase.expectedPath === 'unverified',
  ).length;
  const supportExpectedCaseCount = dataset.cases.filter(
    (testCase) => typeof testCase.reference !== 'undefined' || typeof testCase.sourceText !== 'undefined',
  ).length;

  const summaryWithoutStatus = {
    totalCases,
    passedCases,
    failedCases: totalCases - passedCases,
    groundedCaseCount,
    groundedAnswerRate: groundedCaseCount === 0
      ? 1
      : roundRate(
          caseResults.filter(
            (caseResult) =>
              caseResult.expectedPath !== 'unverified'
              && caseResult.passed,
          ).length / groundedCaseCount,
        ),
    unsupportedCaseCount,
    unverifiedRateOnUnsupportedPrompts: unsupportedCaseCount === 0
      ? 1
      : roundRate(
          caseResults.filter(
            (caseResult) =>
              (caseResult.expectedPath === 'unverified' || caseResult.bucket === 'ambiguous')
              && caseResult.actualPath === 'unverified'
              && caseResult.cautionSatisfied,
          ).length / unsupportedCaseCount,
        ),
    obviousHallucinationCount: caseResults.filter((caseResult) => caseResult.obviousHallucination).length,
    incorrectPathCount: caseResults.filter(
      (caseResult) =>
        !caseResult.pathCorrect
        || !caseResult.projectRetrievalCorrect
        || !caseResult.webGroundingCorrect,
    ).length,
    correctedByDatasetExpectationCount:
      caseResults.filter((caseResult) => caseResult.correctedByDatasetExpectation).length,
    supportExpectedCaseCount,
    supportPresenceRate: supportExpectedCaseCount === 0
      ? 1
      : roundRate(
          caseResults.filter((caseResult) => caseResult.sourceSupportPresent).length
          / supportExpectedCaseCount,
        ),
  } satisfies Omit<HallucinationScoreSummary, 'status'>;

  return {
    ...summaryWithoutStatus,
    status: determineHallucinationStatus(summaryWithoutStatus, thresholds),
  };
}

export function scoreHallucinationRun(
  dataset: HallucinationDatasetDocument,
  run: HallucinationRunArtifact,
  thresholds: HallucinationThresholds = DEFAULT_HALLUCINATION_THRESHOLDS,
): HallucinationScoredArtifact {
  if (run.datasetId !== dataset.datasetId) {
    throw new Error(`run artifact datasetId ${run.datasetId} did not match dataset ${dataset.datasetId}`);
  }

  const resultById = new Map(run.results.map((result) => [result.id, result]));
  const missingIds = dataset.cases
    .map((testCase) => testCase.id)
    .filter((id) => !resultById.has(id));
  const extraIds = run.results
    .map((result) => result.id)
    .filter((id) => !dataset.cases.some((testCase) => testCase.id === id));

  if (missingIds.length > 0) {
    throw new Error(`run artifact is missing dataset cases: ${missingIds.join(', ')}`);
  }

  if (extraIds.length > 0) {
    throw new Error(`run artifact has unknown result ids: ${extraIds.join(', ')}`);
  }

  const caseResults = dataset.cases.map((testCase) => buildCaseScore(testCase, resultById.get(testCase.id)!));
  const summary = summarizeScores(dataset, caseResults, thresholds);

  return {
    schemaVersion: 1,
    datasetId: dataset.datasetId,
    runLabel: run.runLabel,
    generatedAt: run.generatedAt,
    scoredAt: new Date().toISOString(),
    thresholds,
    summary,
    caseResults,
  };
}
