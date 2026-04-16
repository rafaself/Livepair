import { IsString, IsUUID, Matches } from 'class-validator';
import type { UpdateChatMessageRequest } from '@livepair/shared-types';

export class UpdateMessageDto {
  @IsUUID()
  id!: string;

  @IsUUID()
  chatId!: string;

  @IsString()
  @Matches(/\S/, { message: 'contentText must contain non-whitespace characters' })
  contentText!: UpdateChatMessageRequest['contentText'];
}
