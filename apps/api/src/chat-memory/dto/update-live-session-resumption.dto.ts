import { IsBoolean, IsISO8601, IsOptional, IsString, IsUUID } from 'class-validator';
import type { UpdateLiveSessionResumptionRequest } from '@livepair/shared-types';

export class UpdateLiveSessionResumptionDto
  implements UpdateLiveSessionResumptionRequest
{
  kind = 'resumption' as const;

  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  resumptionHandle?: string | null;

  @IsOptional()
  @IsISO8601()
  lastResumptionUpdateAt?: string | null;

  @IsOptional()
  @IsBoolean()
  restorable?: boolean;

  @IsOptional()
  @IsISO8601()
  invalidatedAt?: string | null;

  @IsOptional()
  @IsString()
  invalidationReason?: string | null;
}
