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

  it('delegates token creation to SessionService with the received DTO', () => {
    const dto: CreateEphemeralTokenRequest = { sessionId: 'session-123' };
    const serviceResponse: CreateEphemeralTokenResponse = {
      token: 'stub-token',
      expiresAt: new Date().toISOString(),
      isStub: true,
    };
    createEphemeralToken.mockReturnValue(serviceResponse);

    const result = controller.createToken(dto);

    expect(createEphemeralToken).toHaveBeenCalledTimes(1);
    expect(createEphemeralToken).toHaveBeenCalledWith(dto);
    expect(result).toEqual(serviceResponse);
  });
});
