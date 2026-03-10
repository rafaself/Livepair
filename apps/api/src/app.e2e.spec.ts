import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { SessionController } from './session/session.controller';
import { HealthController } from './health/health.controller';
import { CreateEphemeralTokenDto } from './session/dto/create-ephemeral-token.dto';
import { CreateTextChatDto } from './session/dto/create-text-chat.dto';

describe('API regression (module + validation)', () => {
  it('compiles AppModule and resolves core controllers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeDefined();
    expect(moduleRef.get(SessionController)).toBeDefined();
  });

  it('ValidationPipe rejects invalid sessionId type', async () => {
    const pipe = new ValidationPipe({ whitelist: true });

    await expect(
      pipe.transform(
        { sessionId: 123 },
        { type: 'body', metatype: CreateEphemeralTokenDto },
      ),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining(['sessionId must be a string']),
      },
    });
  });

  it('ValidationPipe strips unknown properties when whitelist=true', async () => {
    const pipe = new ValidationPipe({ whitelist: true });

    const value = await pipe.transform(
      { sessionId: 'session-2', ignoredField: 'x' },
      { type: 'body', metatype: CreateEphemeralTokenDto },
    );

    expect(value).toEqual({ sessionId: 'session-2' });
  });

  it('ValidationPipe rejects invalid text chat payloads', async () => {
    const pipe = new ValidationPipe({ whitelist: true });

    await expect(
      pipe.transform(
        {
          messages: [{ role: 'system', content: '' }],
        },
        { type: 'body', metatype: CreateTextChatDto },
      ),
    ).rejects.toMatchObject({
      response: {
        message: expect.arrayContaining([
          'messages.0.role must be one of the following values: user, assistant',
          'messages.0.content should not be empty',
        ]),
      },
    });
  });

  it('ValidationPipe strips unknown fields from text chat payloads when whitelist=true', async () => {
    const pipe = new ValidationPipe({ whitelist: true });

    const value = await pipe.transform(
      {
        messages: [
          {
            role: 'user',
            content: 'Summarize the current screen',
            ignoredField: 'x',
          },
        ],
        ignoredTopLevelField: true,
      },
      { type: 'body', metatype: CreateTextChatDto },
    );

    expect(value).toEqual({
      messages: [
        {
          role: 'user',
          content: 'Summarize the current screen',
        },
      ],
    });
  });
});
