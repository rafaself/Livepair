import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Res,
} from '@nestjs/common';
import type {
  ChatMessageRecord,
  ChatRecord,
  DurableChatSummaryRecord,
  LiveSessionRecord,
} from '@livepair/shared-types';
import { AppendMessageDto } from './dto/append-message.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { CreateLiveSessionDto } from './dto/create-live-session.dto';
import { EndLiveSessionDto } from './dto/end-live-session.dto';
import { UpdateLiveSessionResumptionDto } from './dto/update-live-session-resumption.dto';
import { UpdateLiveSessionSnapshotDto } from './dto/update-live-session-snapshot.dto';
import { ChatMemoryService } from './chat-memory.service';

type ResponseLike = {
  status(code: number): void;
};

@Controller('chat-memory')
export class ChatMemoryController {
  constructor(private readonly chatMemoryService: ChatMemoryService) {}

  @Post('chats')
  createChat(@Body() dto: CreateChatDto): Promise<ChatRecord> {
    return this.chatMemoryService.createChat(dto);
  }

  @Put('chats/current')
  getOrCreateCurrentChat(): Promise<ChatRecord> {
    return this.chatMemoryService.getOrCreateCurrentChat();
  }

  @Get('chats')
  listChats(): Promise<ChatRecord[]> {
    return this.chatMemoryService.listChats();
  }

  @Get('chats/:chatId')
  async getChat(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
  ): Promise<ChatRecord> {
    const chat = await this.chatMemoryService.getChat(chatId);

    if (chat === null) {
      throw new NotFoundException(`Chat not found: ${chatId}`);
    }

    return chat;
  }

  @Get('chats/:chatId/messages')
  listMessages(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
  ): Promise<ChatMessageRecord[]> {
    return this.chatMemoryService.listMessages(chatId);
  }

  @Post('chats/:chatId/messages')
  appendMessage(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @Body() dto: AppendMessageDto,
  ): Promise<ChatMessageRecord> {
    this.assertMatchingId('chatId', chatId, dto.chatId);
    return this.chatMemoryService.appendMessage(dto);
  }

  @Get('chats/:chatId/summary')
  async getChatSummary(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<DurableChatSummaryRecord | undefined> {
    const summary = await this.chatMemoryService.getChatSummary(chatId);

    if (summary === null) {
      response.status(204);
      return undefined;
    }

    return summary;
  }

  @Post('chats/:chatId/live-sessions')
  createLiveSession(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
    @Body() dto: CreateLiveSessionDto,
  ): Promise<LiveSessionRecord> {
    this.assertMatchingId('chatId', chatId, dto.chatId);
    return this.chatMemoryService.createLiveSession(dto);
  }

  @Get('chats/:chatId/live-sessions')
  listLiveSessions(
    @Param('chatId', new ParseUUIDPipe()) chatId: string,
  ): Promise<LiveSessionRecord[]> {
    return this.chatMemoryService.listLiveSessions(chatId);
  }

  @Patch('live-sessions/:id/resumption')
  updateLiveSessionResumption(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLiveSessionResumptionDto,
  ): Promise<LiveSessionRecord> {
    this.assertMatchingId('id', id, dto.id);
    return this.chatMemoryService.updateLiveSession({
      ...dto,
      kind: 'resumption',
    });
  }

  @Patch('live-sessions/:id/snapshot')
  updateLiveSessionSnapshot(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLiveSessionSnapshotDto,
  ): Promise<LiveSessionRecord> {
    this.assertMatchingId('id', id, dto.id);
    return this.chatMemoryService.updateLiveSession({
      ...dto,
      kind: 'snapshot',
    });
  }

  @HttpCode(200)
  @Post('live-sessions/:id/end')
  endLiveSession(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EndLiveSessionDto,
  ): Promise<LiveSessionRecord> {
    this.assertMatchingId('id', id, dto.id);
    return this.chatMemoryService.endLiveSession(dto);
  }

  private assertMatchingId(pathParamName: string, pathParamValue: string, bodyId: string): void {
    if (pathParamValue !== bodyId) {
      throw new BadRequestException(
        `Path parameter ${pathParamName} must match body id field`,
      );
    }
  }
}
