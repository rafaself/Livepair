import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ASSISTANT_VOICES,
  LIVE_MEDIA_RESOLUTIONS,
  MAX_SYSTEM_INSTRUCTION_LENGTH,
  SESSION_ID_MAX_LENGTH,
  SESSION_ID_PATTERN,
  type CreateEphemeralTokenRequest,
  type CreateEphemeralTokenVoiceSessionPolicy,
} from '@livepair/shared-types';

class CreateEphemeralTokenVoiceSessionPolicyDto {
  @IsOptional()
  @IsIn(ASSISTANT_VOICES)
  voice?: CreateEphemeralTokenVoiceSessionPolicy['voice'];

  @IsOptional()
  @IsString()
  @MaxLength(MAX_SYSTEM_INSTRUCTION_LENGTH)
  systemInstruction?: string;

  @IsOptional()
  @IsBoolean()
  groundingEnabled?: boolean;

  @IsOptional()
  @IsIn(LIVE_MEDIA_RESOLUTIONS)
  mediaResolution?: CreateEphemeralTokenVoiceSessionPolicy['mediaResolution'];

  @IsOptional()
  @IsBoolean()
  contextCompressionEnabled?: boolean;
}

export class CreateEphemeralTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(SESSION_ID_MAX_LENGTH)
  @Matches(SESSION_ID_PATTERN, {
    message: 'sessionId must contain only URL-safe characters',
  })
  sessionId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateEphemeralTokenVoiceSessionPolicyDto)
  voiceSessionPolicy?: CreateEphemeralTokenVoiceSessionPolicyDto;
}

export function toCreateEphemeralTokenRequest(
  dto: CreateEphemeralTokenDto,
): CreateEphemeralTokenRequest {
  return {
    ...(typeof dto.sessionId === 'string' ? { sessionId: dto.sessionId } : {}),
    ...(dto.voiceSessionPolicy
      ? {
          voiceSessionPolicy: {
            ...(dto.voiceSessionPolicy.voice !== undefined
              ? { voice: dto.voiceSessionPolicy.voice }
              : {}),
            ...(dto.voiceSessionPolicy.systemInstruction !== undefined
              ? { systemInstruction: dto.voiceSessionPolicy.systemInstruction }
              : {}),
            ...(dto.voiceSessionPolicy.groundingEnabled !== undefined
              ? { groundingEnabled: dto.voiceSessionPolicy.groundingEnabled }
              : {}),
            ...(dto.voiceSessionPolicy.mediaResolution !== undefined
              ? { mediaResolution: dto.voiceSessionPolicy.mediaResolution }
              : {}),
            ...(dto.voiceSessionPolicy.contextCompressionEnabled !== undefined
              ? { contextCompressionEnabled: dto.voiceSessionPolicy.contextCompressionEnabled }
              : {}),
          } satisfies CreateEphemeralTokenVoiceSessionPolicy,
        }
      : {}),
  };
}
