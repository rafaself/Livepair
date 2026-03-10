import { Test, TestingModule } from '@nestjs/testing';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import type {
  CreateEphemeralTokenRequest,
  CreateEphemeralTokenResponse,
  TextChatRequest,
  TextChatStreamEvent,
} from '@livepair/shared-types';

describe('SessionController', () => {
  let controller: SessionController;
  let createEphemeralToken: jest.MockedFunction<
    SessionService['createEphemeralToken']
  >;
  let streamTextChat: jest.MockedFunction<SessionService['streamTextChat']>;

  async function* createEventStream(events: TextChatStreamEvent[]) {
    for (const event of events) {
      yield event;
    }
  }

  beforeEach(async () => {
    createEphemeralToken = jest.fn();
    streamTextChat = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        {
          provide: SessionService,
          useValue: { createEphemeralToken, streamTextChat },
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

  it('streams text chat events as NDJSON', async () => {
    const dto: TextChatRequest = {
      messages: [{ role: 'user', content: 'Summarize the current screen' }],
    };
    const response = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
    };
    const request = {
      on: jest.fn(),
    };
    const events: TextChatStreamEvent[] = [
      { type: 'text-delta', text: 'Here is ' },
      { type: 'text-delta', text: 'the summary.' },
      { type: 'completed' },
    ];
    streamTextChat.mockReturnValue(createEventStream(events));

    await expect(
      controller.streamTextChat(dto, request as never, response as never),
    ).resolves.toBeUndefined();

    expect(streamTextChat).toHaveBeenCalledWith(
      dto,
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    );
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson');
    expect(response.write).toHaveBeenNthCalledWith(
      1,
      `${JSON.stringify(events[0])}\n`,
    );
    expect(response.write).toHaveBeenNthCalledWith(
      2,
      `${JSON.stringify(events[1])}\n`,
    );
    expect(response.write).toHaveBeenNthCalledWith(
      3,
      `${JSON.stringify(events[2])}\n`,
    );
    expect(response.end).toHaveBeenCalledTimes(1);
  });
});
