import { Test, TestingModule } from '@nestjs/testing';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
} from '@livepair/shared-types';

describe('SessionController', () => {
  let controller: SessionController;
  let createEphemeralToken: jest.MockedFunction<
    SessionService['createEphemeralToken']
  >;

  beforeEach(async () => {
    createEphemeralToken = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        {
          provide: SessionService,
          useValue: { createEphemeralToken },
        },
      ],
    }).compile();

    controller = module.get<SessionController>(SessionController);
  });

  it('delegates token creation to SessionService with the received DTO', async () => {
    const dto: CreateEphemeralTokenRequest = { sessionId: 'session-123' };
    const serviceResponse: CreateEphemeralTokenResponse = {
      token: 'ephemeral-token',
      expireTime: new Date().toISOString(),
      newSessionExpireTime: new Date().toISOString(),
    };
    createEphemeralToken.mockResolvedValue(serviceResponse);

    await expect(controller.createToken(dto)).resolves.toEqual(serviceResponse);
    expect(createEphemeralToken).toHaveBeenCalledTimes(1);
    expect(createEphemeralToken).toHaveBeenCalledWith(dto);
  });
});
