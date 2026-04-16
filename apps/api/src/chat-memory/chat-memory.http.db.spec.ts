import type { INestApplication } from '@nestjs/common';
import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import type { AddressInfo } from 'net';
import { randomUUID } from 'node:crypto';
import type { DatabaseService } from '../database/database.service';
import { describeWithDatabase, truncateChatMemoryTables } from './testing/database-test-utils';

const CHAT_MEMORY_AUTH_SECRET = 'desktop-secret';

function withAuthHeaders(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers);
  headers.set(SESSION_TOKEN_AUTH_HEADER_NAME, CHAT_MEMORY_AUTH_SECRET);
  return {
    ...init,
    headers,
  };
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function readText(response: Response): Promise<string> {
  return response.text();
}

describeWithDatabase('ChatMemory HTTP integration', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;
  let app: INestApplication;
  let baseUrl: string;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_TOKEN_AUTH_SECRET: CHAT_MEMORY_AUTH_SECRET,
    };
    const [{ AppModule }, { DatabaseService: DatabaseServiceToken }] = await Promise.all([
      import('../app.module'),
      import('../database/database.service'),
    ]);
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    databaseService = app.get(DatabaseServiceToken);
    global.fetch = ((
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith(`${baseUrl}/chat-memory`)) {
        return originalFetch(input, withAuthHeaders(init));
      }

      return originalFetch(input, init);
    }) as typeof fetch;
  });

  beforeEach(async () => {
    await truncateChatMemoryTables(databaseService);
  });

  afterAll(async () => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    if (typeof app !== 'undefined') {
      await app.close();
    }
  });

  it('returns 204 with no body when a chat has no durable summary yet', async () => {
    const currentChatResponse = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    });
    expect(currentChatResponse.status).toBe(200);
    const currentChat = await readJson<ChatRecord>(currentChatResponse);

    const summaryResponse = await fetch(`${baseUrl}/chat-memory/chats/${currentChat.id}/summary`);
    expect(summaryResponse.status).toBe(204);
    await expect(readText(summaryResponse)).resolves.toBe('');
  });

  it('creates chats, messages, live sessions, and durable summaries through the HTTP surface', async () => {
    const currentChatResponse = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    });
    expect(currentChatResponse.status).toBe(200);
    const currentChat = await readJson<ChatRecord>(currentChatResponse);
    expect(currentChat).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        isCurrent: true,
      }),
    );

    const createChatResponse = await fetch(`${baseUrl}/chat-memory/chats`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: 'Fresh chat' }),
    });
    expect(createChatResponse.status).toBe(201);
    const createdChat = await readJson<ChatRecord>(createChatResponse);
    expect(createdChat).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        title: 'Fresh chat',
        isCurrent: true,
      }),
    );

    const previousCurrentResponse = await fetch(`${baseUrl}/chat-memory/chats/${currentChat.id}`);
    expect(previousCurrentResponse.status).toBe(200);
    await expect(readJson<ChatRecord>(previousCurrentResponse)).resolves.toEqual({
      ...currentChat,
      isCurrent: false,
    });

    const appendMessageResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${createdChat.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
         body: JSON.stringify({
           chatId: createdChat.id,
           role: 'assistant',
           contentText: 'Visible assistant reply',
           answerMetadata: {
              provenance: 'unverified',
              confidence: 'low',
              reason: 'No verified evidence was attached to this reply.',
              thinkingText: 'Hidden assistant draft',
            },
          }),
        },
      );
    expect(appendMessageResponse.status).toBe(201);
    const createdMessage = await readJson<ChatMessageRecord>(appendMessageResponse);
    expect(createdMessage).toEqual(
        expect.objectContaining({
          chatId: createdChat.id,
          role: 'assistant',
          contentText: 'Visible assistant reply',
          answerMetadata: {
            provenance: 'unverified',
            confidence: 'low',
            reason: 'No verified evidence was attached to this reply.',
            thinkingText: 'Hidden assistant draft',
          },
          sequence: 1,
        }),
      );

    const createLiveSessionResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${createdChat.id}/live-sessions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: createdChat.id,
          voice: 'Kore',
          startedAt: '2026-03-12T09:00:00.000Z',
        }),
      },
    );
    expect(createLiveSessionResponse.status).toBe(201);
    const createdLiveSession = await readJson<LiveSessionRecord>(createLiveSessionResponse);

    const updateResumptionResponse = await fetch(
      `${baseUrl}/chat-memory/live-sessions/${createdLiveSession.id}/resumption`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'resumption',
          id: createdLiveSession.id,
          resumptionHandle: 'handles/live-session-1',
          restorable: true,
        }),
      },
    );
    expect(updateResumptionResponse.status).toBe(200);

    const updateSnapshotResponse = await fetch(
      `${baseUrl}/chat-memory/live-sessions/${createdLiveSession.id}/snapshot`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kind: 'snapshot',
          id: createdLiveSession.id,
          summarySnapshot: 'Persisted summary snapshot',
          contextStateSnapshot: {
            task: {
              entries: [{ key: 'taskStatus', value: 'active' }],
            },
            context: {
              entries: [{ key: 'repo', value: 'Livepair' }],
            },
          },
        }),
      },
    );
    expect(updateSnapshotResponse.status).toBe(200);

    const endLiveSessionResponse = await fetch(
      `${baseUrl}/chat-memory/live-sessions/${createdLiveSession.id}/end`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: createdLiveSession.id,
          status: 'ended',
          endedAt: '2026-03-12T09:05:00.000Z',
          endedReason: 'user-ended',
        }),
      },
    );
    expect(endLiveSessionResponse.status).toBe(200);
    await expect(readJson<LiveSessionRecord>(endLiveSessionResponse)).resolves.toEqual(
      expect.objectContaining({
        id: createdLiveSession.id,
        chatId: createdChat.id,
        status: 'ended',
        endedReason: 'user-ended',
        restorable: false,
        resumptionHandle: null,
      }),
    );

    const messagesResponse = await fetch(`${baseUrl}/chat-memory/chats/${createdChat.id}/messages`);
    expect(messagesResponse.status).toBe(200);
    await expect(readJson<ChatMessageRecord[]>(messagesResponse)).resolves.toEqual([
      expect.objectContaining({
        id: createdMessage.id,
        sequence: 1,
      }),
    ]);

    const liveSessionsResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${createdChat.id}/live-sessions`,
    );
    expect(liveSessionsResponse.status).toBe(200);
    await expect(readJson<LiveSessionRecord[]>(liveSessionsResponse)).resolves.toEqual([
      expect.objectContaining({
        id: createdLiveSession.id,
        voice: 'Kore',
        summarySnapshot: 'Persisted summary snapshot',
      }),
    ]);

    const summaryResponse = await fetch(`${baseUrl}/chat-memory/chats/${createdChat.id}/summary`);
    expect(summaryResponse.status).toBe(200);
    await expect(readJson<DurableChatSummaryRecord>(summaryResponse)).resolves.toEqual(
      expect.objectContaining({
        chatId: createdChat.id,
        coveredThroughSequence: 1,
      }),
    );
  });

  it('updates persisted messages through the HTTP surface without changing message identity', async () => {
    const chat = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    }).then((response) => readJson<ChatRecord>(response));
    const createdMessage = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chat.id,
        role: 'user',
        contentText: 'Original transcript',
      }),
    }).then((response) => readJson<ChatMessageRecord>(response));

    const updateResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages/${createdMessage.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: createdMessage.id,
          chatId: chat.id,
          contentText: 'Corrected transcript',
        }),
      },
    );

    expect(updateResponse.status).toBe(200);
    await expect(readJson<ChatMessageRecord>(updateResponse)).resolves.toEqual({
      ...createdMessage,
      contentText: 'Corrected transcript',
    });

    const messagesResponse = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/messages`);
    expect(messagesResponse.status).toBe(200);
    await expect(readJson<ChatMessageRecord[]>(messagesResponse)).resolves.toEqual([
      {
        ...createdMessage,
        contentText: 'Corrected transcript',
      },
    ]);
  });

  it('rejects invalid and mismatched update-message payloads', async () => {
    const chat = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    }).then((response) => readJson<ChatRecord>(response));
    const createdMessage = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chat.id,
        role: 'user',
        contentText: 'Original transcript',
      }),
    }).then((response) => readJson<ChatMessageRecord>(response));

    const invalidPayloadResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages/${createdMessage.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: createdMessage.id,
          chatId: chat.id,
          contentText: '   ',
        }),
      },
    );
    expect(invalidPayloadResponse.status).toBe(400);

    const mismatchedIdResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages/${createdMessage.id}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: randomUUID(),
          chatId: chat.id,
          contentText: 'Corrected transcript',
        }),
      },
    );
    expect(mismatchedIdResponse.status).toBe(400);
  });

  it('returns 404 when updating a missing persisted message', async () => {
    const chat = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    }).then((response) => readJson<ChatRecord>(response));
    const missingMessageId = randomUUID();

    const updateResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages/${missingMessageId}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: missingMessageId,
          chatId: chat.id,
          contentText: 'Corrected transcript',
        }),
      },
    );

    expect(updateResponse.status).toBe(404);
  });

  it('supports bounded latest-item reads for messages and live sessions', async () => {
    const chat = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    }).then((response) => readJson<ChatRecord>(response));

    const firstMessage = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chat.id,
        role: 'user',
        contentText: 'First turn',
      }),
    }).then((response) => readJson<ChatMessageRecord>(response));
    const secondMessage = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chat.id,
        role: 'assistant',
        contentText: 'Second turn',
      }),
    }).then((response) => readJson<ChatMessageRecord>(response));

    await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/live-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chat.id,
        voice: 'Puck',
        startedAt: '2026-03-12T09:00:00.000Z',
      }),
    }).then((response) => readJson<LiveSessionRecord>(response));
    const secondLiveSession = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/live-sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chatId: chat.id,
        voice: 'Kore',
        startedAt: '2026-03-12T10:00:00.000Z',
      }),
    }).then((response) => readJson<LiveSessionRecord>(response));

    const boundedMessagesResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages?limit=1`,
    );
    expect(boundedMessagesResponse.status).toBe(200);
    await expect(readJson<ChatMessageRecord[]>(boundedMessagesResponse)).resolves.toEqual([
      secondMessage,
    ]);

    const boundedLiveSessionsResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/live-sessions?limit=1`,
    );
    expect(boundedLiveSessionsResponse.status).toBe(200);
    await expect(readJson<LiveSessionRecord[]>(boundedLiveSessionsResponse)).resolves.toEqual([
      secondLiveSession,
    ]);

    const invalidLimitResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages?limit=0`,
    );
    expect(invalidLimitResponse.status).toBe(400);

    const fullMessagesResponse = await fetch(`${baseUrl}/chat-memory/chats/${chat.id}/messages`);
    expect(fullMessagesResponse.status).toBe(200);
    await expect(readJson<ChatMessageRecord[]>(fullMessagesResponse)).resolves.toEqual([
      firstMessage,
      secondMessage,
    ]);
  });

  it('returns 404 for missing chat list and summary reads', async () => {
    const missingChatId = randomUUID();

    const messagesResponse = await fetch(`${baseUrl}/chat-memory/chats/${missingChatId}/messages`);
    expect(messagesResponse.status).toBe(404);

    const summaryResponse = await fetch(`${baseUrl}/chat-memory/chats/${missingChatId}/summary`);
    expect(summaryResponse.status).toBe(404);

    const liveSessionsResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${missingChatId}/live-sessions`,
    );
    expect(liveSessionsResponse.status).toBe(404);
  });

  it('rejects invalid payloads and path/body id mismatches', async () => {
    const chat = await fetch(`${baseUrl}/chat-memory/chats/current`, {
      method: 'PUT',
    }).then((response) => readJson<ChatRecord>(response));

    const invalidMessageResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: chat.id,
          role: 'system',
          contentText: '',
        }),
      },
    );

    expect(invalidMessageResponse.status).toBe(400);

    const mismatchedChatIdResponse = await fetch(
      `${baseUrl}/chat-memory/chats/${chat.id}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chatId: randomUUID(),
          role: 'user',
          contentText: 'First turn',
        }),
      },
    );

    expect(mismatchedChatIdResponse.status).toBe(400);

    const missingChatResponse = await fetch(`${baseUrl}/chat-memory/chats/${randomUUID()}`);
    expect(missingChatResponse.status).toBe(404);
  });
});
