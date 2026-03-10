import {
  ArrayMinSize,
  IsIn,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { TextChatMessage, TextChatRequest } from '@livepair/shared-types';

class TextChatMessageDto implements TextChatMessage {
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @IsString()
  @IsNotEmpty()
  content!: string;
}

export class CreateTextChatDto implements TextChatRequest {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TextChatMessageDto)
  messages!: TextChatMessageDto[];
}
