import { Body, Controller, Post, Res, Req } from '@nestjs/common';
import type {
  CreateEphemeralTokenResponse,
  TextChatRequest,
  TextChatStreamEvent,
} from '@livepair/shared-types';
import { CreateEphemeralTokenDto } from './dto/create-ephemeral-token.dto';
import { CreateTextChatDto } from './dto/create-text-chat.dto';
import { SessionService } from './session.service';

type SessionChatRequest = {
  on: (event: 'close', listener: () => void) => void;
};

type SessionChatResponse = {
  setHeader: (name: string, value: string) => void;
  flushHeaders: () => void;
  write: (chunk: string) => void;
  end: () => void;
};

function writeNdjsonEvent(response: SessionChatResponse, event: TextChatStreamEvent): void {
  response.write(`${JSON.stringify(event)}\n`);
}

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('token')
  createToken(
    @Body() dto: CreateEphemeralTokenDto,
  ): Promise<CreateEphemeralTokenResponse> {
    return this.sessionService.createEphemeralToken(dto);
  }

  @Post('chat')
  async streamTextChat(
    @Body() dto: CreateTextChatDto,
    @Req() request: SessionChatRequest,
    @Res() response: SessionChatResponse,
  ): Promise<void> {
    response.setHeader('Content-Type', 'application/x-ndjson');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders();

    const abortController = new AbortController();
    request.on('close', () => {
      abortController.abort();
    });

    try {
      for await (const event of this.sessionService.streamTextChat(dto as TextChatRequest, {
        signal: abortController.signal,
      })) {
        writeNdjsonEvent(response, event);
      }
    } catch (error) {
      const detail = error instanceof Error && error.message.length > 0
        ? error.message
        : 'Text chat request failed';
      writeNdjsonEvent(response, { type: 'error', detail });
    } finally {
      response.end();
    }
  }
}
