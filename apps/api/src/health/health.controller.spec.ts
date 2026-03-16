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

  it('returns status ok with a timestamp', () => {
    const firstResult: HealthResponse = controller.check();
    const secondResult: HealthResponse = controller.check();

    expect(firstResult.status).toBe('ok');
    expect(typeof firstResult.timestamp).toBe('string');
    expect(new Date(firstResult.timestamp).toISOString()).toBe(firstResult.timestamp);
    expect(secondResult).toEqual(firstResult);
  });
});
