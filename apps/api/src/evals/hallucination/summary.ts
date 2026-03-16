import type {
  HallucinationGateStatus,
  HallucinationScoreSummary,
  HallucinationSummaryComparison,
  HallucinationThresholds,
} from './types';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function roundDelta(value: number): number {
  return Number(value.toFixed(4));
}

export const DEFAULT_HALLUCINATION_THRESHOLDS: HallucinationThresholds = {
  pass: {
    minGroundedAnswerRate: 0.8,
    minUnverifiedRateOnUnsupportedPrompts: 0.85,
    maxObviousHallucinationCount: 0,
    maxIncorrectPathCount: 4,
  },
  warning: {
    minGroundedAnswerRate: 0.5,
    minUnverifiedRateOnUnsupportedPrompts: 0.5,
    maxObviousHallucinationCount: 3,
    maxIncorrectPathCount: 10,
  },
};

function meetsThreshold(
  summary: Omit<HallucinationScoreSummary, 'status'>,
  threshold: HallucinationThresholds['pass'],
): boolean {
  return (
    summary.groundedAnswerRate >= threshold.minGroundedAnswerRate
    && summary.unverifiedRateOnUnsupportedPrompts >= threshold.minUnverifiedRateOnUnsupportedPrompts
    && summary.obviousHallucinationCount <= threshold.maxObviousHallucinationCount
    && summary.incorrectPathCount <= threshold.maxIncorrectPathCount
  );
}

export function determineHallucinationStatus(
  summary: Omit<HallucinationScoreSummary, 'status'>,
  thresholds: HallucinationThresholds = DEFAULT_HALLUCINATION_THRESHOLDS,
): HallucinationGateStatus {
  if (meetsThreshold(summary, thresholds.pass)) {
    return 'pass';
  }

  if (meetsThreshold(summary, thresholds.warning)) {
    return 'warning';
  }

  return 'fail';
}

export function formatHallucinationSummary(summary: HallucinationScoreSummary): string {
  return [
    `Status: ${summary.status.toUpperCase()}`,
    `Passed cases: ${summary.passedCases}/${summary.totalCases}`,
    `Grounded answer rate: ${formatPercent(summary.groundedAnswerRate)}`,
    `Unverified rate on unsupported prompts: ${formatPercent(summary.unverifiedRateOnUnsupportedPrompts)}`,
    `Obvious hallucinations: ${summary.obviousHallucinationCount}`,
    `Incorrect path count: ${summary.incorrectPathCount}`,
    `Source-support presence rate: ${formatPercent(summary.supportPresenceRate)}`,
  ].join('\n');
}

export function compareHallucinationSummaries(
  baseline: HallucinationScoreSummary,
  current: HallucinationScoreSummary,
): HallucinationSummaryComparison {
  return {
    groundedAnswerRateDelta: roundDelta(current.groundedAnswerRate - baseline.groundedAnswerRate),
    unverifiedRateDelta: roundDelta(
      current.unverifiedRateOnUnsupportedPrompts - baseline.unverifiedRateOnUnsupportedPrompts,
    ),
    obviousHallucinationDelta:
      current.obviousHallucinationCount - baseline.obviousHallucinationCount,
    incorrectPathDelta: current.incorrectPathCount - baseline.incorrectPathCount,
    passedCasesDelta: current.passedCases - baseline.passedCases,
    statusChanged: current.status !== baseline.status,
  };
}

export function formatHallucinationComparison(
  comparison: HallucinationSummaryComparison,
): string {
  const withSign = (value: number): string => (value > 0 ? `+${value}` : String(value));

  return [
    'Comparison vs baseline:',
    `Grounded answer rate delta: ${withSign(comparison.groundedAnswerRateDelta)}`,
    `Unverified rate delta: ${withSign(comparison.unverifiedRateDelta)}`,
    `Obvious hallucination delta: ${withSign(comparison.obviousHallucinationDelta)}`,
    `Incorrect path delta: ${withSign(comparison.incorrectPathDelta)}`,
    `Passed cases delta: ${withSign(comparison.passedCasesDelta)}`,
    `Status changed: ${comparison.statusChanged ? 'yes' : 'no'}`,
  ].join('\n');
}
