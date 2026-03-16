import type { AnswerMetadata, AnswerProvenance, ChatMessageRole } from '@livepair/shared-types';

export type HallucinationBucket =
  | 'project_specific_factual'
  | 'public_current_factual'
  | 'ambiguous'
  | 'impossible_or_insufficient';

export interface HallucinationConversationTurn {
  role: ChatMessageRole;
  content: string;
}

export interface HallucinationDatasetCase {
  id: string;
  bucket: HallucinationBucket;
  prompt: string;
  conversationHistory?: HallucinationConversationTurn[] | undefined;
  expectedPath: AnswerProvenance;
  shouldUseProjectRetrieval: boolean;
  shouldUseWebGrounding: boolean;
  shouldAbstainOrBeCautious: boolean;
  reference?: string | undefined;
  sourceText?: string | undefined;
  requiredSubstrings?: string[] | undefined;
  forbiddenSubstrings?: string[] | undefined;
  requiredCautionSubstrings?: string[] | undefined;
  notes?: string | undefined;
}

export interface HallucinationDatasetDocument {
  schemaVersion: 1;
  datasetId: string;
  cases: HallucinationDatasetCase[];
}

export interface HallucinationSupportingEvidence {
  label: string;
  uri?: string | undefined;
  text?: string | undefined;
}

export interface HallucinationRunResult {
  id: string;
  response: string;
  answerMetadata?: AnswerMetadata | undefined;
  usedProjectRetrieval?: boolean | undefined;
  usedWebGrounding?: boolean | undefined;
  supportingEvidence?: HallucinationSupportingEvidence[] | undefined;
  notes?: string | undefined;
}

export interface HallucinationRunArtifact {
  schemaVersion: 1;
  datasetId: string;
  runLabel: string;
  generatedAt: string;
  results: HallucinationRunResult[];
}

export type HallucinationGateStatus = 'pass' | 'warning' | 'fail';

export interface HallucinationThresholdLevel {
  minGroundedAnswerRate: number;
  minUnverifiedRateOnUnsupportedPrompts: number;
  maxObviousHallucinationCount: number;
  maxIncorrectPathCount: number;
}

export interface HallucinationThresholds {
  pass: HallucinationThresholdLevel;
  warning: HallucinationThresholdLevel;
}

export interface HallucinationCaseScore {
  id: string;
  bucket: HallucinationBucket;
  expectedPath: AnswerProvenance;
  actualPath: AnswerProvenance | null;
  passed: boolean;
  pathCorrect: boolean;
  projectRetrievalCorrect: boolean;
  webGroundingCorrect: boolean;
  cautionSatisfied: boolean;
  responseChecksPassed: boolean;
  sourceSupportPresent: boolean;
  obviousHallucination: boolean;
  correctedByDatasetExpectation: boolean;
  failureReasons: string[];
}

export interface HallucinationScoreSummary {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  groundedCaseCount: number;
  groundedAnswerRate: number;
  unsupportedCaseCount: number;
  unverifiedRateOnUnsupportedPrompts: number;
  obviousHallucinationCount: number;
  incorrectPathCount: number;
  correctedByDatasetExpectationCount: number;
  supportExpectedCaseCount: number;
  supportPresenceRate: number;
  status: HallucinationGateStatus;
}

export interface HallucinationSummaryComparison {
  groundedAnswerRateDelta: number;
  unverifiedRateDelta: number;
  obviousHallucinationDelta: number;
  incorrectPathDelta: number;
  passedCasesDelta: number;
  statusChanged: boolean;
}

export interface HallucinationScoredArtifact {
  schemaVersion: 1;
  datasetId: string;
  runLabel: string;
  generatedAt: string;
  scoredAt: string;
  thresholds: HallucinationThresholds;
  summary: HallucinationScoreSummary;
  caseResults: HallucinationCaseScore[];
  comparison?: HallucinationSummaryComparison | undefined;
}
