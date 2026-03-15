import { IsIn, IsString, IsUUID, Matches } from 'class-validator';
import type { AppendChatMessageRequest } from '@livepair/shared-types';

export class AppendMessageDto implements AppendChatMessageRequest {
  @IsUUID()
  chatId!: string;

  @IsIn(['user', 'assistant'])
  role!: AppendChatMessageRequest['role'];

  @IsString()
  @Matches(/\S/, { message: 'contentText must contain non-whitespace characters' })
  contentText!: string;
}
