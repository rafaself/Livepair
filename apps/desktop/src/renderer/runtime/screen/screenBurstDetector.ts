import {
  computePerceptualHashDistance,
  type ScreenFrameAnalysis,
} from './screenFrameAnalysis';

const NORMALIZED_TILE_RANGE = 255;

export type ScreenBurstObservation = {
  score: number;
  threshold: number;
  triggered: boolean;
  luminanceDelta: number;
  edgeDelta: number;
  hashDistance: number;
};

export type ScreenBurstDetector = {
  observe: (analysis: ScreenFrameAnalysis, timestampMs: number) => ScreenBurstObservation;
  reset: () => void;
};

export type ScreenBurstDetectorOptions = {
  baselineWindowSize?: number;
  scoreWindowSize?: number;
  minimumWarmupFrames?: number;
  thresholdFloor?: number;
  thresholdStdDevMultiplier?: number;
  minimumSignalDelta?: number;
  rearmCooldownMs?: number;
  hysteresisMs?: number;
  hysteresisBump?: number;
};

type DetectorSample = Pick<ScreenFrameAnalysis, 'tileLuminance' | 'tileEdge' | 'perceptualHash'>;

const DEFAULT_OPTIONS = {
  baselineWindowSize: 6,
  scoreWindowSize: 10,
  minimumWarmupFrames: 3,
  thresholdFloor: 0.04,
  thresholdStdDevMultiplier: 2.2,
  minimumSignalDelta: 0.02,
  rearmCooldownMs: 1_000,
  hysteresisMs: 2_000,
  hysteresisBump: 0.02,
} satisfies Required<ScreenBurstDetectorOptions>;

function mean(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) {
    return 0;
  }

  const average = mean(values);
  const variance = values.reduce((total, value) => total + ((value - average) ** 2), 0) / values.length;

  return Math.sqrt(variance);
}

function averageTileMetrics(samples: number[][]): number[] {
  const referenceLength = samples[0]?.length ?? 0;
  const sums = new Array<number>(referenceLength).fill(0);

  for (const sample of samples) {
    for (let index = 0; index < referenceLength; index += 1) {
      sums[index] = (sums[index] ?? 0) + (sample[index] ?? 0);
    }
  }

  return sums.map((total) => total / Math.max(1, samples.length));
}

function meanAbsoluteDelta(current: number[], baseline: number[]): number {
  if (current.length === 0 || baseline.length === 0) {
    return 0;
  }

  const comparisonLength = Math.min(current.length, baseline.length);
  let total = 0;

  for (let index = 0; index < comparisonLength; index += 1) {
    total += Math.abs((current[index] ?? 0) - (baseline[index] ?? 0));
  }

  return (total / comparisonLength) / NORMALIZED_TILE_RANGE;
}

export function createScreenBurstDetector(
  options: ScreenBurstDetectorOptions = {},
): ScreenBurstDetector {
  const config = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let baselineSamples: DetectorSample[] = [];
  let scoreHistory: number[] = [];
  let lastTriggerAt = Number.NEGATIVE_INFINITY;

  return {
    observe: (analysis, timestampMs) => {
      if (baselineSamples.length === 0) {
        baselineSamples = [{
          tileLuminance: analysis.tileLuminance,
          tileEdge: analysis.tileEdge,
          perceptualHash: analysis.perceptualHash,
        }];

        return {
          score: 0,
          threshold: config.thresholdFloor,
          triggered: false,
          luminanceDelta: 0,
          edgeDelta: 0,
          hashDistance: 0,
        };
      }

      const baselineLuminance = averageTileMetrics(
        baselineSamples.map((sample) => sample.tileLuminance),
      );
      const baselineEdge = averageTileMetrics(
        baselineSamples.map((sample) => sample.tileEdge),
      );
      const baselineHash = baselineSamples[baselineSamples.length - 1]?.perceptualHash ?? analysis.perceptualHash;
      const luminanceDelta = meanAbsoluteDelta(analysis.tileLuminance, baselineLuminance);
      const edgeDelta = meanAbsoluteDelta(analysis.tileEdge, baselineEdge);
      const hashDistance = computePerceptualHashDistance(analysis.perceptualHash, baselineHash);
      const score = (luminanceDelta * 0.45) + (edgeDelta * 0.35) + (hashDistance * 0.20);
      const adaptiveThreshold = Math.max(
        config.thresholdFloor,
        mean(scoreHistory) + (standardDeviation(scoreHistory) * config.thresholdStdDevMultiplier),
      );
      const threshold = adaptiveThreshold + (
        timestampMs - lastTriggerAt <= config.hysteresisMs ? config.hysteresisBump : 0
      );
      const signalStrongEnough = Math.max(luminanceDelta, edgeDelta, hashDistance) >= config.minimumSignalDelta;
      const componentTrigger = (
        hashDistance >= 0.06
        || (luminanceDelta >= 0.02 && edgeDelta >= 0.015)
        || edgeDelta >= 0.03
      );
      const triggered = (
        baselineSamples.length >= config.minimumWarmupFrames
        && signalStrongEnough
        && timestampMs - lastTriggerAt >= config.rearmCooldownMs
        && (score >= threshold || componentTrigger)
      );

      baselineSamples = [
        ...baselineSamples.slice(-(config.baselineWindowSize - 1)),
        {
          tileLuminance: analysis.tileLuminance,
          tileEdge: analysis.tileEdge,
          perceptualHash: analysis.perceptualHash,
        },
      ];
      scoreHistory = [...scoreHistory.slice(-(config.scoreWindowSize - 1)), score];

      if (triggered) {
        lastTriggerAt = timestampMs;
      }

      return {
        score,
        threshold,
        triggered,
        luminanceDelta,
        edgeDelta,
        hashDistance,
      };
    },
    reset: () => {
      baselineSamples = [];
      scoreHistory = [];
      lastTriggerAt = Number.NEGATIVE_INFINITY;
    },
  };
}
