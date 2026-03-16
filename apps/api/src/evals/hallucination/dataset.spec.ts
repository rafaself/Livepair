import {
  DEFAULT_HALLUCINATION_DATASET_PATH,
  loadHallucinationDataset,
  validateHallucinationDatasetDocument,
} from './dataset';

describe('hallucination dataset', () => {
  it('loads the bundled Wave 5 dataset with all four buckets represented', () => {
    const dataset = loadHallucinationDataset(DEFAULT_HALLUCINATION_DATASET_PATH);
    const bucketCounts = dataset.cases.reduce<Record<string, number>>((counts, testCase) => {
      counts[testCase.bucket] = (counts[testCase.bucket] ?? 0) + 1;
      return counts;
    }, {});

    expect(dataset.datasetId).toMatch(/^wave5-hallucination-regression-v\d+$/);
    expect(dataset.cases).toHaveLength(40);
    expect(bucketCounts).toEqual({
      ambiguous: 10,
      impossible_or_insufficient: 10,
      project_specific_factual: 10,
      public_current_factual: 10,
    });
  });

  it('rejects duplicate ids and empty prompts', () => {
    expect(() =>
      validateHallucinationDatasetDocument({
        schemaVersion: 1,
        datasetId: 'wave5-hallucination-regression-v1',
        cases: [
          {
            id: 'case-1',
            bucket: 'project_specific_factual',
            prompt: '  ',
            expectedPath: 'project_grounded',
            shouldUseProjectRetrieval: true,
            shouldUseWebGrounding: false,
            shouldAbstainOrBeCautious: false,
          },
          {
            id: 'case-1',
            bucket: 'ambiguous',
            prompt: 'Is this ambiguous?',
            expectedPath: 'unverified',
            shouldUseProjectRetrieval: false,
            shouldUseWebGrounding: false,
            shouldAbstainOrBeCautious: true,
          },
        ],
      }),
    ).toThrow('dataset.cases[0].prompt');
  });
});
