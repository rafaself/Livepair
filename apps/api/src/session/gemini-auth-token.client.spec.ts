import { BadGatewayException } from '@nestjs/common';
import { ObservabilityService } from '../observability/observability.service';
import { requestGeminiAuthToken } from './gemini-auth-token.client';

describe('requestGeminiAuthToken', () => {
  let fetchImpl: jest.MockedFunction<typeof fetch>;
  let consoleErrorSpy: jest.SpyInstance;
  let observabilityService: ObservabilityService;

  function createRequestOptions(): Parameters<typeof requestGeminiAuthToken>[0] {
    return {
      apiKey: 'gemini-key',
      fetchImpl,
      newSessionExpireTime: '2026-03-09T12:01:30.000Z',
      expireTime: '2099-03-09T12:30:00.000Z',
      liveConnectConstraints: {
        model: 'models/gemini-2.0-flash-live-001',
        config: {
          responseModalities: ['AUDIO'],
          sessionResumption: {},
        },
      },
      observabilityService,
    } as Parameters<typeof requestGeminiAuthToken>[0];
  }

  beforeEach(() => {
    fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    observabilityService = new ObservabilityService();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('maps the Gemini auth token payload into the shared response shape', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      json: async () => ({
        name: 'auth-tokens/abc123',
      }),
    } as Response);

    await expect(requestGeminiAuthToken(createRequestOptions())).resolves.toEqual({
      token: 'auth-tokens/abc123',
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-key',
        },
        body: JSON.stringify({
          uses: 1,
          newSessionExpireTime: '2026-03-09T12:01:30.000Z',
          expireTime: '2099-03-09T12:30:00.000Z',
          liveConnectConstraints: {
            model: 'models/gemini-2.0-flash-live-001',
            config: {
              responseModalities: ['AUDIO'],
              sessionResumption: {},
            },
          },
        }),
      },
    );

    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_requests_total\{outcome="success"\} 1/,
    );
    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_request_duration_seconds_count 1/,
    );
  });

  it('maps upstream non-ok responses to a bad gateway error', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({
        error: {
          code: 500,
          message: 'backend unavailable',
        },
      }),
    } as Response);

    await expect(requestGeminiAuthToken(createRequestOptions())).rejects.toEqual(
      new BadGatewayException('Gemini token request failed: upstream 500 - backend unavailable'),
    );

    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_requests_total\{outcome="upstream_error"\} 1/,
    );
    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_request_duration_seconds_count 1/,
    );
  });

  it('maps network failures to a bad gateway error', async () => {
    fetchImpl.mockRejectedValue(new Error('network down'));

    await expect(requestGeminiAuthToken(createRequestOptions())).rejects.toEqual(
      new BadGatewayException('Gemini token request failed: network down'),
    );

    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_requests_total\{outcome="network_error"\} 1/,
    );
    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_request_duration_seconds_count 1/,
    );
  });

  it('classifies malformed upstream payloads as invalid payloads', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        expireTime: '2099-03-09T12:30:00.000Z',
      }),
    } as Response);

    await expect(requestGeminiAuthToken(createRequestOptions())).rejects.toEqual(
      new BadGatewayException('Gemini token response was invalid'),
    );

    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_requests_total\{outcome="invalid_payload"\} 1/,
    );
    await expect(observabilityService.getMetrics()).resolves.toMatch(
      /gemini_auth_token_request_duration_seconds_count 1/,
    );
  });

  it('rejects blank upstream token names', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        name: '   ',
        expireTime: '2099-03-09T12:30:00.000Z',
      }),
    } as Response);

    await expect(requestGeminiAuthToken(createRequestOptions())).rejects.toEqual(
      new BadGatewayException('Gemini token response was invalid'),
    );
  });

});
