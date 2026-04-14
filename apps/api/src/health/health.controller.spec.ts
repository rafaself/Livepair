import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import type { HealthResponse } from '@livepair/shared-types';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('returns status ok with the current request timestamp', () => {
    const beforeIso = new Date().toISOString();
    const result: HealthResponse = controller.check();
    const afterIso = new Date().toISOString();

    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
    expect(result.timestamp >= beforeIso).toBe(true);
    expect(result.timestamp <= afterIso).toBe(true);
  });
});
