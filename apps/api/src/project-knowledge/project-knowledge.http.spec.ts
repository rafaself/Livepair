import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import type { AddressInfo } from 'net';
import type { ProjectKnowledgeSearchResult } from '@livepair/shared-types';

async function createProjectKnowledgeApp() {
  const { ValidationPipe } = await import('@nestjs/common');
  const { Test } = await import('@nestjs/testing');
  const { AppModule } = await import('../app.module');
  const { ProjectKnowledgeService } = await import('./project-knowledge.service');

  const searchProjectKnowledge = jest.fn<
    Promise<ProjectKnowledgeSearchResult>,
    [{ query: string }]
  >().mockResolvedValue({
    summaryAnswer: 'The backend issues the token and the desktop connects directly to Gemini Live.',
    supportingExcerpts: [
      {
        sourceId: 'architecture',
        text: 'Speech mode requests an ephemeral token from POST /session/token, then connects directly from the desktop to Gemini Live.',
      },
    ],
    sources: [
      {
        id: 'architecture',
        title: 'docs/ARCHITECTURE.md',
        path: 'docs/ARCHITECTURE.md',
      },
    ],
    confidence: 'medium',
    retrievalStatus: 'grounded',
  });

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ProjectKnowledgeService)
    .useValue({ searchProjectKnowledge })
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.listen(0, '127.0.0.1');

  const address = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    baseUrl: `http://127.0.0.1:${address.port}`,
    searchProjectKnowledge,
  };
}

describe('Project knowledge HTTP', () => {
  const originalEnv = process.env;
  const PROJECT_KNOWLEDGE_AUTH_SECRET = 'project-knowledge-secret';
  let app: INestApplication | undefined;
  let harness: Awaited<ReturnType<typeof createProjectKnowledgeApp>> | undefined;

  beforeEach(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
      SESSION_TOKEN_AUTH_SECRET: PROJECT_KNOWLEDGE_AUTH_SECRET,
      PROJECT_KNOWLEDGE_RATE_LIMIT_MAX_REQUESTS: '2',
      PROJECT_KNOWLEDGE_RATE_LIMIT_WINDOW_MS: '60000',
    };
    harness = await createProjectKnowledgeApp();
    app = harness.app;
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }

    harness = undefined;
    process.env = originalEnv;
  });

  it('returns the structured retrieval result from the service', async () => {
    if (!harness) {
      throw new Error('Project knowledge test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: PROJECT_KNOWLEDGE_AUTH_SECRET,
      },
      body: JSON.stringify({
        query: 'How do live sessions connect?',
      }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      summaryAnswer: 'The backend issues the token and the desktop connects directly to Gemini Live.',
      supportingExcerpts: [
        {
          sourceId: 'architecture',
          text: 'Speech mode requests an ephemeral token from POST /session/token, then connects directly from the desktop to Gemini Live.',
        },
      ],
      sources: [
        {
          id: 'architecture',
          title: 'docs/ARCHITECTURE.md',
          path: 'docs/ARCHITECTURE.md',
        },
      ],
      confidence: 'medium',
      retrievalStatus: 'grounded',
    });
    expect(harness.searchProjectKnowledge).toHaveBeenCalledWith({
      query: 'How do live sessions connect?',
    });
  });

  it('rejects searches without the install auth header', async () => {
    if (!harness) {
      throw new Error('Project knowledge test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: 'How do live sessions connect?',
      }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects searches with an invalid install auth header', async () => {
    if (!harness) {
      throw new Error('Project knowledge test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'wrong-secret',
      },
      body: JSON.stringify({
        query: 'How do live sessions connect?',
      }),
    });

    expect(response.status).toBe(403);
  });

  it('rejects blank queries at the DTO boundary', async () => {
    if (!harness) {
      throw new Error('Project knowledge test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: PROJECT_KNOWLEDGE_AUTH_SECRET,
      },
      body: JSON.stringify({
        query: '   ',
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      statusCode: 400,
      message: ['query must contain non-whitespace characters'],
      error: 'Bad Request',
    });
  });

  it('rate limits burst project-knowledge searches', async () => {
    if (!harness) {
      throw new Error('Project knowledge test harness was not initialized');
    }

    const headers = {
      'Content-Type': 'application/json',
      [SESSION_TOKEN_AUTH_HEADER_NAME]: PROJECT_KNOWLEDGE_AUTH_SECRET,
    };
    const body = JSON.stringify({
      query: 'How do live sessions connect?',
    });

    const firstResponse = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers,
      body,
    });
    const secondResponse = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers,
      body,
    });
    const thirdResponse = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers,
      body,
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(thirdResponse.status).toBe(429);
    expect(harness.searchProjectKnowledge).toHaveBeenCalledTimes(2);
  });
});
