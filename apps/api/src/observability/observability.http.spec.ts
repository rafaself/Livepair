import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { AddressInfo } from 'net';
import { AppModule } from '../app.module';

describe('Observability HTTP integration', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeEach(async () => {
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
});
