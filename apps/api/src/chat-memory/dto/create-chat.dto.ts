import { IsOptional, IsString } from 'class-validator';
import type { CreateChatRequest } from '@livepair/shared-types';

export class CreateChatDto implements CreateChatRequest {
  @IsOptional()
  @IsString()
  title?: string | null;
}
