import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import {
  ASSISTANT_VOICES,
  type CreateLiveSessionRequest,
} from '@livepair/shared-types';

export class CreateLiveSessionDto implements CreateLiveSessionRequest {
  @IsUUID()
  chatId!: string;

  @IsIn(ASSISTANT_VOICES)
  voice!: CreateLiveSessionRequest['voice'];

  @IsOptional()
  @IsISO8601()
  startedAt?: string;
}
