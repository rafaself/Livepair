import { BadGatewayException, ServiceUnavailableException } from '@nestjs/common';
import { env } from '../config/env';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';
import { GeminiTextClient } from './gemini-text.client';
import { SessionService } from './session.service';
import type { TextChatStreamEvent } from '@livepair/shared-types';

describe('SessionService', () => {
  let service: SessionService;
  let createToken: jest.MockedFunction<GeminiAuthTokenClient['createToken']>;
  let streamText: jest.MockedFunction<GeminiTextClient['streamText']>;
  const originalGeminiApiKey = env.geminiApiKey;
  const originalEphemeralTokenTtlSeconds = env.ephemeralTokenTtlSeconds;
  const originalGeminiTextModel = env.geminiTextModel;

  beforeEach(() => {
    createToken = jest.fn();
    streamText = jest.fn();
    service = new SessionService({
      createToken,
    } as unknown as GeminiAuthTokenClient, {
      streamText,
    } as unknown as GeminiTextClient);
    env.geminiApiKey = 'gemini-key';
    env.ephemeralTokenTtlSeconds = 90;
    env.geminiTextModel = 'gemini-2.5-flash';
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00.000Z'));
  });

  afterEach(() => {
    env.geminiApiKey = originalGeminiApiKey;
    env.ephemeralTokenTtlSeconds = originalEphemeralTokenTtlSeconds;
    env.geminiTextModel = originalGeminiTextModel;
    jest.useRealTimers();
  });

  it('returns a real ephemeral token response', async () => {
    createToken.mockResolvedValue({
      token: 'auth-tokens/abc123',
    });

    await expect(service.createEphemeralToken({})).resolves.toEqual({
      token: 'auth-tokens/abc123',
      expireTime: '2026-03-09T12:31:30.000Z',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
    });
  });

  it('requests a one-time token with a TTL-derived new session expiry and relative overall expiry', async () => {
    createToken.mockResolvedValue({
      token: 'auth-tokens/abc123',
    });

    await service.createEphemeralToken({ sessionId: 'test-session' });

    expect(createToken).toHaveBeenCalledWith({
      apiKey: 'gemini-key',
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      expireTime: '2026-03-09T12:31:30.000Z',
    });
  });

  it('throws a service unavailable error when the Gemini API key is missing', async () => {
    env.geminiApiKey = '';

    const tokenPromise = service.createEphemeralToken({});

    await expect(tokenPromise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(tokenPromise).rejects.toMatchObject({
      message: 'Gemini API key is not configured',
      status: 503,
    });
    expect(createToken).not.toHaveBeenCalled();
  });

  it('propagates provider failures as bad gateway errors', async () => {
    createToken.mockRejectedValue(new BadGatewayException('Gemini token request failed'));

    const tokenPromise = service.createEphemeralToken({});

    await expect(tokenPromise).rejects.toBeInstanceOf(BadGatewayException);
    await expect(tokenPromise).rejects.toMatchObject({
      message: 'Gemini token request failed',
      status: 502,
    });
  });

  it('streams text chat events through the dedicated Gemini text client', async () => {
    const events: TextChatStreamEvent[] = [
      { type: 'text-delta', text: 'Here is ' },
      { type: 'text-delta', text: 'the summary.' },
      { type: 'completed' },
    ];
    streamText.mockReturnValue(createEventStream(events));

    await expect(
      collectEvents(
        service.streamTextChat({
          messages: [{ role: 'user', content: 'Summarize the current screen' }],
        }),
      ),
    ).resolves.toEqual(events);

    expect(streamText).toHaveBeenCalledWith({
      apiKey: 'gemini-key',
      model: 'gemini-2.5-flash',
      messages: [{ role: 'user', content: 'Summarize the current screen' }],
    });
  });

  it('rejects Live or audio models for text chat', async () => {
    env.geminiTextModel = 'models/gemini-2.0-flash-live-001';

    expect(() =>
      service.streamTextChat({
        messages: [{ role: 'user', content: 'Summarize the current screen' }],
      }),
    ).toThrow(
      'Invalid Gemini text model config: text mode cannot use Gemini Live or audio models',
    );
    expect(streamText).not.toHaveBeenCalled();
  });
});
  async function collectEvents(
    stream: AsyncIterable<TextChatStreamEvent>,
  ): Promise<TextChatStreamEvent[]> {
    const events: TextChatStreamEvent[] = [];

    for await (const event of stream) {
      events.push(event);
    }

    return events;
  }

  async function* createEventStream(events: TextChatStreamEvent[]) {
    for (const event of events) {
      yield event;
    }
  }
