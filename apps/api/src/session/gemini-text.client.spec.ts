import { BadGatewayException } from '@nestjs/common';
import { requestGeminiTextStream } from './gemini-text.client';

describe('requestGeminiTextStream', () => {
  let fetchImpl: jest.MockedFunction<typeof fetch>;
  let consoleErrorSpy: jest.SpyInstance;

  async function collectEvents(stream: AsyncIterable<unknown>): Promise<unknown[]> {
    const events: unknown[] = [];

    for await (const event of stream) {
      events.push(event);
    }

    return events;
  }

  beforeEach(() => {
    fetchImpl = jest.fn() as jest.MockedFunction<typeof fetch>;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('maps Gemini SSE chunks into internal text stream events', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              [
                'data: {"candidates":[{"content":{"parts":[{"text":"Here is "}]} }]}',
                '',
                'data: {"candidates":[{"content":{"parts":[{"text":"the summary."}]} }]}',
                '',
              ].join('\n'),
            ),
          );
          controller.close();
        },
      }),
    } as Response);

    await expect(
      collectEvents(
        requestGeminiTextStream({
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
          fetchImpl,
          messages: [{ role: 'user', content: 'Summarize the current screen' }],
        }),
      ),
    ).resolves.toEqual([
      { type: 'text-delta', text: 'Here is ' },
      { type: 'text-delta', text: 'the summary.' },
      { type: 'completed' },
    ]);

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'x-goog-api-key': 'gemini-key',
        }),
      }),
    );
  });

  it('maps upstream non-ok responses to a bad gateway error', async () => {
    fetchImpl.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({
        error: {
          message: 'INVALID_ARGUMENT',
        },
      }),
    } as Response);

    await expect(
      collectEvents(
        requestGeminiTextStream({
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
          fetchImpl,
          messages: [{ role: 'user', content: 'Summarize the current screen' }],
        }),
      ),
    ).rejects.toEqual(
      new BadGatewayException(
        'Gemini text request failed: upstream 400 - INVALID_ARGUMENT',
      ),
    );
  });

  it('rejects missing upstream streams', async () => {
    fetchImpl.mockResolvedValue({
      ok: true,
      body: null,
    } as Response);

    await expect(
      collectEvents(
        requestGeminiTextStream({
          apiKey: 'gemini-key',
          model: 'gemini-2.5-flash',
          fetchImpl,
          messages: [{ role: 'user', content: 'Summarize the current screen' }],
        }),
      ),
    ).rejects.toEqual(new BadGatewayException('Gemini text response stream was unavailable'));
  });
});
