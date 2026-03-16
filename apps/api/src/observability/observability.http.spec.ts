import type { INestApplication } from '@nestjs/common';
import { SESSION_TOKEN_AUTH_HEADER_NAME } from '@livepair/shared-types';
import type { AddressInfo } from 'net';

function createLiveTelemetryBatchBody(): Record<string, unknown> {
  return {
    events: [
      {
        eventType: 'live_session_started',
        occurredAt: '2026-03-16T14:00:00.000Z',
        sessionId: 'session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
      },
      {
        eventType: 'live_session_ended',
        occurredAt: '2026-03-16T14:02:00.000Z',
        sessionId: 'session-1',
        chatId: 'chat-1',
        environment: 'test',
        platform: 'linux',
        appVersion: '0.0.1',
        model: 'models/gemini',
        durationMs: 120000,
        firstResponseLatencyMs: 800,
        resumeCount: 1,
        interruptionCount: 2,
        closeReason: 'user_stop',
      },
    ],
  };
}

describe('Observability HTTP integration', () => {
  const originalEnv = process.env;
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
    jest.resetModules();
    process.env = {
      ...originalEnv,
      SESSION_TOKEN_AUTH_SECRET: 'observability-secret',
    };
    const { ValidationPipe } = await import('@nestjs/common');
    const { Test } = await import('@nestjs/testing');
    const { AppModule } = await import('../app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));

    await app.listen(0, '127.0.0.1');

    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    process.env = originalEnv;
    await app.close();
  });

  it('serves Prometheus text exposition from GET /metrics', async () => {
    const response = await fetch(`${baseUrl}/metrics`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');

    const body = await response.text();
    expect(body).toContain('# HELP');
    expect(body).toContain('# TYPE');
    expect(body).toContain('process_cpu_user_seconds_total');
    expect(body).toContain('process_start_time_seconds');
  });

  it('records request totals, duration, and errors for existing routes', async () => {
    const healthResponse = await fetch(`${baseUrl}/health`);
    expect(healthResponse.status).toBe(200);

    const invalidTokenResponse = await fetch(`${baseUrl}/session/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'observability-secret',
      },
      body: JSON.stringify({ sessionId: 123 }),
    });
    expect(invalidTokenResponse.status).toBe(400);

    await fetch(`${baseUrl}/missing-route`);

    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    const metrics = await metricsResponse.text();

    expect(metrics).toMatch(
      /livepair_api_http_requests_total\{method="GET",route="\/health",status_code="200"\} 1/,
    );
    expect(metrics).toMatch(
      /livepair_api_http_request_duration_seconds_count\{method="GET",route="\/health",status_code="200"\} 1/,
    );
    expect(metrics).toMatch(
      /livepair_api_http_requests_total\{method="POST",route="\/session\/token",status_code="400"\} 1/,
    );
    expect(metrics).toMatch(
      /livepair_api_http_request_errors_total\{method="POST",route="\/session\/token",status_code="400"\} 1/,
    );
    expect(metrics).toMatch(
      /livepair_api_http_request_duration_seconds_count\{method="POST",route="\/session\/token",status_code="400"\} 1/,
    );
    expect(metrics).toMatch(
      /livepair_api_http_request_errors_total\{method="GET",route="unmatched",status_code="404"\} 1/,
    );
  });

  it('accepts a protected live telemetry batch', async () => {
    const response = await fetch(`${baseUrl}/observability/live-telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'observability-secret',
      },
      body: JSON.stringify(createLiveTelemetryBatchBody()),
    });

    expect(response.status).toBe(202);
    await expect(response.text()).resolves.toBe('');
  });

  it('rejects live telemetry batches without the desktop auth header', async () => {
    const response = await fetch(`${baseUrl}/observability/live-telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createLiveTelemetryBatchBody()),
    });

    expect(response.status).toBe(401);
  });

  it('rejects live telemetry batches with an invalid desktop auth header', async () => {
    const response = await fetch(`${baseUrl}/observability/live-telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'wrong-secret',
      },
      body: JSON.stringify(createLiveTelemetryBatchBody()),
    });

    expect(response.status).toBe(403);
  });

  it('rejects malformed live telemetry batches', async () => {
    const response = await fetch(`${baseUrl}/observability/live-telemetry`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [SESSION_TOKEN_AUTH_HEADER_NAME]: 'observability-secret',
      },
      body: JSON.stringify({
        events: [
          {
            eventType: 'live_usage_reported',
            occurredAt: '2026-03-16T14:01:00.000Z',
            sessionId: 'session-1',
            chatId: 'chat-1',
            environment: 'test',
            platform: 'linux',
            appVersion: '0.0.1',
            model: 'models/gemini',
          },
        ],
      }),
    });

    expect(response.status).toBe(400);
  });
});
