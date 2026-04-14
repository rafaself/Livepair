import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import type { CreateEphemeralTokenRequest } from '@livepair/shared-types';

const SESSION_ID_MAX_LENGTH = 128;
// Permit URL-safe identifier characters: alphanumerics plus dash and underscore.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export class CreateEphemeralTokenDto implements CreateEphemeralTokenRequest {
  @IsOptional()
  @IsString()
  @MaxLength(SESSION_ID_MAX_LENGTH)
  @Matches(SESSION_ID_PATTERN, {
    message: 'sessionId must contain only URL-safe characters',
  })
  sessionId?: string;
}
