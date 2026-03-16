import type { HallucinationScoreSummary } from './types';
import {
  compareHallucinationSummaries,
  formatHallucinationSummary,
} from './summary';

const BASELINE: HallucinationScoreSummary = {
  totalCases: 40,
  passedCases: 28,
  failedCases: 12,
  groundedCaseCount: 20,
  groundedAnswerRate: 0.7,
  unsupportedCaseCount: 20,
  unverifiedRateOnUnsupportedPrompts: 0.6,
  obviousHallucinationCount: 4,
  incorrectPathCount: 7,
  correctedByDatasetExpectationCount: 1,
  supportExpectedCaseCount: 20,
  supportPresenceRate: 0.5,
  status: 'warning',
};

const CURRENT: HallucinationScoreSummary = {
  totalCases: 40,
  passedCases: 35,
  failedCases: 5,
  groundedCaseCount: 20,
  groundedAnswerRate: 0.85,
  unsupportedCaseCount: 20,
  unverifiedRateOnUnsupportedPrompts: 0.9,
  obviousHallucinationCount: 0,
  incorrectPathCount: 2,
  correctedByDatasetExpectationCount: 2,
  supportExpectedCaseCount: 20,
  supportPresenceRate: 0.8,
  status: 'pass',
};

describe('hallucination summary helpers', () => {
  it('formats a short human-readable summary with threshold status', () => {
    const summary = formatHallucinationSummary(CURRENT);

    expect(summary).toContain('Status: PASS');
    expect(summary).toContain('Grounded answer rate: 85.0%');
    expect(summary).toContain('Unverified rate on unsupported prompts: 90.0%');
    expect(summary).toContain('Obvious hallucinations: 0');
  });

  it('computes before/after deltas for regression comparison', () => {
    expect(compareHallucinationSummaries(BASELINE, CURRENT)).toEqual({
      groundedAnswerRateDelta: 0.15,
      unverifiedRateDelta: 0.3,
      obviousHallucinationDelta: -4,
      incorrectPathDelta: -5,
      passedCasesDelta: 7,
      statusChanged: true,
    });
  });
});
