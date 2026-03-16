import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  DEFAULT_HALLUCINATION_DATASET_PATH,
  loadHallucinationDataset,
  loadHallucinationRunArtifact,
} from './dataset';
import { scoreHallucinationRun } from './scoring';
import {
  compareHallucinationSummaries,
  formatHallucinationComparison,
  formatHallucinationSummary,
} from './summary';
import type { HallucinationScoredArtifact } from './types';

type CliOptions = {
  datasetPath: string;
  resultsPath: string;
  outputPath?: string;
  baselineResultsPath?: string;
};

export type HallucinationCliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
};

function printUsage(io: HallucinationCliIo): void {
  io.stderr(
    'Usage: runHallucinationRegression --results <path> [--dataset <path>] [--output <path>] [--baseline-results <path>]',
  );
}

export function parseHallucinationCliArgs(argv: string[]): CliOptions {
  let datasetPath = DEFAULT_HALLUCINATION_DATASET_PATH;
  let resultsPath: string | null = null;
  let outputPath: string | undefined;
  let baselineResultsPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = argv[index + 1];

    if (argument === '--') {
      continue;
    }

    if (argument === '--dataset') {
      if (!nextValue) {
        throw new Error('--dataset requires a path');
      }
      datasetPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--results') {
      if (!nextValue) {
        throw new Error('--results requires a path');
      }
      resultsPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--output') {
      if (!nextValue) {
        throw new Error('--output requires a path');
      }
      outputPath = nextValue;
      index += 1;
      continue;
    }

    if (argument === '--baseline-results') {
      if (!nextValue) {
        throw new Error('--baseline-results requires a path');
      }
      baselineResultsPath = nextValue;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!resultsPath) {
    throw new Error('--results is required');
  }

  return {
    datasetPath,
    resultsPath,
    ...(outputPath ? { outputPath } : {}),
    ...(baselineResultsPath ? { baselineResultsPath } : {}),
  };
}

function writeScoredArtifact(outputPath: string, artifact: HallucinationScoredArtifact): void {
  const resolvedPath = resolve(outputPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
}

export async function runHallucinationCli(
  argv: string[],
  io: HallucinationCliIo = {
    stdout: (line) => process.stdout.write(`${line}\n`),
    stderr: (line) => process.stderr.write(`${line}\n`),
  },
): Promise<number> {
  try {
    const options = parseHallucinationCliArgs(argv);
    const dataset = loadHallucinationDataset(options.datasetPath);
    const run = loadHallucinationRunArtifact(options.resultsPath);
    const scored = scoreHallucinationRun(dataset, run);

    io.stdout(formatHallucinationSummary(scored.summary));

    if (options.baselineResultsPath) {
      const baselineRun = loadHallucinationRunArtifact(options.baselineResultsPath);
      const baselineScored = scoreHallucinationRun(dataset, baselineRun);
      scored.comparison = compareHallucinationSummaries(baselineScored.summary, scored.summary);
      io.stdout('');
      io.stdout(formatHallucinationComparison(scored.comparison));
    }

    if (options.outputPath) {
      writeScoredArtifact(options.outputPath, scored);
    }

    return scored.summary.status === 'fail' ? 2 : 0;
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown hallucination harness failure';
    io.stderr(detail);
    printUsage(io);
    return 1;
  }
}

if (require.main === module) {
  void runHallucinationCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
