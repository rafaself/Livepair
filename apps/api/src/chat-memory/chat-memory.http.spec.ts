import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import {
  SESSION_TOKEN_AUTH_HEADER_NAME,
  type ChatRecord,
} from '@livepair/shared-types';
import type { AddressInfo } from 'net';

const CHAT_MEMORY_AUTH_SECRET = 'desktop-secret';

describe('Chat memory HTTP auth', () => {
  const originalEnv = process.env;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let app: INestApplication | undefined;
  let baseUrl = '';
  let getCurrentChat: jest.Mock<Promise<ChatRecord | null>, []>;
  let getOrCreateCurrentChat: jest.Mock<Promise<ChatRecord>, []>;

  beforeAll(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_TOKEN_AUTH_SECRET: CHAT_MEMORY_AUTH_SECRET,
    };

    const { ValidationPipe } = await import('@nestjs/common');
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module');
    const { ChatMemoryService } = await import('./chat-memory.service');
    getCurrentChat = jest.fn().mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      title: null,
      createdAt: '2026-03-16T11:00:00.000Z',
      updatedAt: '2026-03-16T11:00:00.000Z',
      isCurrent: true,
    });
    getOrCreateCurrentChat = jest.fn().mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      title: null,
      createdAt: '2026-03-16T11:00:00.000Z',
      updatedAt: '2026-03-16T11:00:00.000Z',
      isCurrent: true,
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ChatMemoryService)
      .useValue({
        getCurrentChat,
        getOrCreateCurrentChat,
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  beforeEach(() => {
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    getCurrentChat.mockClear();
    getOrCreateCurrentChat.mockClear();
  });

  afterAll(async () => {
    process.env = originalEnv;

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('rejects missing chat-memory credentials with 401', async () => {
    const response = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      statusCode: 401,
      message: 'Chat memory credential is required',
      error: 'Unauthorized',
    });
    expect(getOrCreateCurrentChat).not.toHaveBeenCalled();
  });

  it('rejects invalid chat-memory credentials with 403', async () => {
    const response = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'wrong-secret',
      },
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      statusCode: 403,
      message: 'Chat memory credential is invalid',
      error: 'Forbidden',
    });
    expect(getOrCreateCurrentChat).not.toHaveBeenCalled();
  });

  it('allows chat-memory requests with the configured shared credential', async () => {
    const response = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: CHAT_MEMORY_AUTH_SECRET,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      title: null,
      createdAt: '2026-03-16T11:00:00.000Z',
      updatedAt: '2026-03-16T11:00:00.000Z',
      isCurrent: true,
    });
    expect(getOrCreateCurrentChat).toHaveBeenCalledTimes(1);
  });

  it('reads the current chat without creating it', async () => {
    const response = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: CHAT_MEMORY_AUTH_SECRET,
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: '11111111-1111-1111-1111-111111111111',
      title: null,
      createdAt: '2026-03-16T11:00:00.000Z',
      updatedAt: '2026-03-16T11:00:00.000Z',
      isCurrent: true,
    });
    expect(getCurrentChat).toHaveBeenCalledTimes(1);
    expect(getOrCreateCurrentChat).not.toHaveBeenCalled();
  });

  it('returns 404 when no current chat exists yet', async () => {
    getCurrentChat.mockResolvedValueOnce(null);

    const response = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      headers: {
        [SESSION_TOKEN_AUTH_HEADER_NAME]: CHAT_MEMORY_AUTH_SECRET,
      },
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      statusCode: 404,
      message: 'Current chat not found',
      error: 'Not Found',
    });
    expect(getCurrentChat).toHaveBeenCalledTimes(1);
    expect(getOrCreateCurrentChat).not.toHaveBeenCalled();
  });
});
