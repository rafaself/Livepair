import { IsISO8601, IsOptional, IsUUID } from 'class-validator';
import type { CreateLiveSessionRequest } from '@livepair/shared-types';

export class CreateLiveSessionDto implements CreateLiveSessionRequest {
  @IsUUID()
  chatId!: string;

  @IsOptional()
  @IsISO8601()
  startedAt?: string;
}
