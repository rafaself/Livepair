import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from './session.service';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionService],
    }).compile();

    service = module.get<SessionService>(SessionService);
  });

  it('returns a stub token response', () => {
    const result: CreateEphemeralTokenResponse = service.createEphemeralToken(
      {},
    );
    expect(result.isStub).toBe(true);
    expect(typeof result.token).toBe('string');
    expect(result.token.length).toBeGreaterThan(0);
    expect(typeof result.expiresAt).toBe('string');
    expect(new Date(result.expiresAt).toISOString()).toBe(result.expiresAt);
  });

  it('returns a stub token response when sessionId is provided', () => {
    const result = service.createEphemeralToken({ sessionId: 'test-session' });
    expect(result.isStub).toBe(true);
  });
});
