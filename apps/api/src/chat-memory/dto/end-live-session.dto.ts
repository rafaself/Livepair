import { IsIn, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import type { EndLiveSessionRequest } from '@livepair/shared-types';

export class EndLiveSessionDto implements EndLiveSessionRequest {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsISO8601()
  endedAt?: string;

  @IsIn(['ended', 'failed'])
  status!: EndLiveSessionRequest['status'];

  @IsOptional()
  @IsString()
  endedReason?: string | null;
}
