import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runHallucinationCli } from './cli';

describe('runHallucinationCli', () => {
  it('fails fast when results are not provided', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runHallucinationCli([], {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toHaveLength(0);
    expect(stderr[0]).toContain('--results');
  });

  it('writes a machine-readable artifact for a valid run', async () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'hallucination-cli-'));
    const datasetPath = join(tempDir, 'dataset.json');
    const resultsPath = join(tempDir, 'results.json');
    const outputPath = join(tempDir, 'scored.json');

    writeFileSync(
      datasetPath,
      JSON.stringify({
        schemaVersion: 1,
        datasetId: 'wave5-hallucination-regression-v1',
        cases: [
          {
            id: 'case-1',
            bucket: 'ambiguous',
            prompt: 'Could this mean multiple things?',
            expectedPath: 'unverified',
            shouldUseProjectRetrieval: false,
            shouldUseWebGrounding: false,
            shouldAbstainOrBeCautious: true,
            requiredCautionSubstrings: ['depends'],
          },
        ],
      }),
    );
    writeFileSync(
      resultsPath,
      JSON.stringify({
        schemaVersion: 1,
        datasetId: 'wave5-hallucination-regression-v1',
        runLabel: 'sample',
        generatedAt: '2026-03-16T00:00:00.000Z',
        results: [
          {
            id: 'case-1',
            response: 'It depends on the specific meaning.',
            answerMetadata: {
              provenance: 'unverified',
              confidence: 'low',
            },
          },
        ],
      }),
    );

    const exitCode = await runHallucinationCli(
      ['--', '--dataset', datasetPath, '--results', resultsPath, '--output', outputPath],
      {
        stdout: () => undefined,
        stderr: () => undefined,
      },
    );

    expect(exitCode).toBe(0);
    expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toMatchObject({
      datasetId: 'wave5-hallucination-regression-v1',
      summary: {
        totalCases: 1,
        status: 'pass',
      },
      caseResults: [
        {
          id: 'case-1',
          passed: true,
        },
      ],
    });
  });
});
