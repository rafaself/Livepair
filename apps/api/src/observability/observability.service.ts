import { Injectable } from '@nestjs/common';
import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

type HttpMetricLabels = {
  method: string;
  route: string;
  status_code: string;
};

type GeminiAuthTokenMetricLabels = {
  outcome: 'success' | 'network_error' | 'upstream_error' | 'invalid_payload';
};

type SessionTokenMetricLabels = {
  outcome:
    | 'issued'
    | 'auth_required'
    | 'auth_invalid'
    | 'rate_limited'
    | 'upstream_failed'
    | 'service_unavailable';
};

@Injectable()
export class ObservabilityService {
  private readonly registry = new Registry();

  private readonly httpRequestsTotal = new Counter({
    name: 'livepair_api_http_requests_total',
    help: 'Total number of HTTP requests handled by the API.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  private readonly httpRequestDurationSeconds = new Histogram({
    name: 'livepair_api_http_request_duration_seconds',
    help: 'HTTP request duration in seconds.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  private readonly httpRequestErrorsTotal = new Counter({
    name: 'livepair_api_http_request_errors_total',
    help: 'Total number of HTTP requests that completed with an error status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [this.registry],
  });

  private readonly geminiAuthTokenRequestsTotal = new Counter({
    name: 'gemini_auth_token_requests_total',
    help: 'Total number of Gemini auth token upstream requests by outcome.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  private readonly geminiAuthTokenRequestDurationSeconds = new Histogram({
    name: 'gemini_auth_token_request_duration_seconds',
    help: 'Gemini auth token upstream request duration in seconds.',
    registers: [this.registry],
  });

  private readonly sessionTokenRequestsTotal = new Counter({
    name: 'livepair_session_token_requests_total',
    help: 'Total number of protected session token endpoint outcomes by outcome.',
    labelNames: ['outcome'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }

  get contentType(): string {
    return this.registry.contentType;
  }

  getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  recordHttpRequest(labels: HttpMetricLabels, durationSeconds: number): void {
    this.httpRequestsTotal.inc(labels);
    this.httpRequestDurationSeconds.observe(labels, durationSeconds);

    if (Number.parseInt(labels.status_code, 10) >= 400) {
      this.httpRequestErrorsTotal.inc(labels);
    }
  }

  recordGeminiAuthTokenRequest(
    labels: GeminiAuthTokenMetricLabels,
    durationSeconds: number,
  ): void {
    this.geminiAuthTokenRequestsTotal.inc(labels);
    this.geminiAuthTokenRequestDurationSeconds.observe(durationSeconds);
  }

  recordSessionTokenRequest(labels: SessionTokenMetricLabels): void {
    this.sessionTokenRequestsTotal.inc(labels);
  }
}
