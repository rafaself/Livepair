import {
  BadGatewayException,
  Injectable,
} from '@nestjs/common';
import type {
  TextChatMessage,
  TextChatStreamEvent,
} from '@livepair/shared-types';

const GEMINI_TEXT_STREAM_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';

type GeminiTextStreamChunk = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: unknown;
      }>;
    };
  }>;
};

export type GeminiTextRequest = {
  apiKey: string;
  model: string;
  messages: TextChatMessage[];
  signal?: AbortSignal;
};

type RequestGeminiTextStreamOptions = GeminiTextRequest & {
  fetchImpl?: typeof fetch;
};

function normalizeModel(model: string): string {
  const trimmed = model.trim();

  if (!trimmed) {
    throw new BadGatewayException('Gemini text model is not configured');
  }

  return trimmed.startsWith('models/') ? trimmed.slice('models/'.length) : trimmed;
}

function toGeminiRole(role: TextChatMessage['role']): 'user' | 'model' {
  return role === 'assistant' ? 'model' : 'user';
}

function extractTextFromChunk(payload: GeminiTextStreamChunk): string {
  return (payload.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('');
}

async function readUpstreamErrorDetail(response: Response): Promise<string | null> {
  try {
    const text = (await response.text()).trim();

    if (!text) {
      return null;
    }

    try {
      const payload = JSON.parse(text) as {
        error?: {
          message?: unknown;
        };
        message?: unknown;
      };

      if (payload.error && typeof payload.error.message === 'string') {
        return payload.error.message;
      }

      if (typeof payload.message === 'string') {
        return payload.message;
      }
    } catch {
      return text;
    }

    return text;
  } catch {
    return null;
  }
}

function parseSseEventData(eventBlock: string): string | null {
  const dataLines = eventBlock
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim());

  if (dataLines.length === 0) {
    return null;
  }

  return dataLines.join('\n');
}

export async function* requestGeminiTextStream({
  apiKey,
  model,
  messages,
  signal,
  fetchImpl = fetch,
}: RequestGeminiTextStreamOptions): AsyncGenerator<TextChatStreamEvent> {
  const normalizedModel = normalizeModel(model);

  let response: Response;
  try {
    response = await fetchImpl(
      `${GEMINI_TEXT_STREAM_URL}/${normalizedModel}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: messages.map((message) => ({
            role: toGeminiRole(message.role),
            parts: [{ text: message.content }],
          })),
        }),
        ...(signal ? { signal } : {}),
      },
    );
  } catch (error) {
    if (signal?.aborted) {
      return;
    }

    console.error('[session:gemini-text] network request failed', error);
    const detail = error instanceof Error && error.message.length > 0
      ? error.message
      : 'network failure';
    throw new BadGatewayException(`Gemini text request failed: ${detail}`);
  }

  if (!response.ok) {
    const detail = await readUpstreamErrorDetail(response);
    console.error('[session:gemini-text] upstream request failed', {
      status: response.status,
      detail,
    });
    throw new BadGatewayException(
      detail
        ? `Gemini text request failed: upstream ${response.status} - ${detail}`
        : `Gemini text request failed: upstream ${response.status}`,
    );
  }

  if (!response.body) {
    throw new BadGatewayException('Gemini text response stream was unavailable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer = `${buffer}${decoder.decode(value, { stream: true })}`;
    const eventBlocks = buffer.split('\n\n');
    buffer = eventBlocks.pop() ?? '';

    for (const eventBlock of eventBlocks) {
      const data = parseSseEventData(eventBlock);

      if (!data || data === '[DONE]') {
        continue;
      }

      let payload: GeminiTextStreamChunk;
      try {
        payload = JSON.parse(data) as GeminiTextStreamChunk;
      } catch {
        throw new BadGatewayException('Gemini text response was invalid');
      }

      const text = extractTextFromChunk(payload);
      if (text.length > 0) {
        yield { type: 'text-delta', text };
      }
    }
  }

  const trailingData = parseSseEventData(buffer);
  if (trailingData && trailingData !== '[DONE]') {
    let payload: GeminiTextStreamChunk;
    try {
      payload = JSON.parse(trailingData) as GeminiTextStreamChunk;
    } catch {
      throw new BadGatewayException('Gemini text response was invalid');
    }

    const text = extractTextFromChunk(payload);
    if (text.length > 0) {
      yield { type: 'text-delta', text };
    }
  }

  yield { type: 'completed' };
}

@Injectable()
export class GeminiTextClient {
  streamText(request: GeminiTextRequest): AsyncGenerator<TextChatStreamEvent> {
    return requestGeminiTextStream(request);
  }
}
