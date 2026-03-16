import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
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
  let app: INestApplication | undefined;
  let harness: Awaited<ReturnType<typeof createProjectKnowledgeApp>> | undefined;

  beforeAll(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      GEMINI_API_KEY: 'gemini-key',
    };
    harness = await createProjectKnowledgeApp();
    app = harness.app;
  });

  afterAll(async () => {
    process.env = originalEnv;

    if (app) {
      await app.close();
      app = undefined;
    }
  });

  it('returns the structured retrieval result from the service', async () => {
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

  it('rejects blank queries at the DTO boundary', async () => {
    if (!harness) {
      throw new Error('Project knowledge test harness was not initialized');
    }

    const response = await fetch(`${harness.baseUrl}/project-knowledge/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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
});
