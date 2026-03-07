import { IsOptional, IsString } from 'class-validator';
import type { CreateEphemeralTokenRequest } from '@livepair/shared-types';

export class CreateEphemeralTokenDto implements CreateEphemeralTokenRequest {
  @IsOptional()
  @IsString()
  sessionId?: string;
}
