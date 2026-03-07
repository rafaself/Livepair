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
    const result: HealthResponse = controller.check();
    expect(result.status).toBe('ok');
    expect(typeof result.timestamp).toBe('string');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
