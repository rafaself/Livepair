import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { AppendChatMessageRequest } from '@livepair/shared-types';

class AnswerCitationDto {
  @IsString()
  @Matches(/\S/, { message: 'answerMetadata.citations[].label must contain non-whitespace characters' })
  label!: string;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'answerMetadata.citations[].uri must contain non-whitespace characters' })
  uri?: string | undefined;
}

class AnswerMetadataDto {
  @IsIn(['project_grounded', 'web_grounded', 'tool_grounded', 'unverified'])
  provenance!: NonNullable<AppendChatMessageRequest['answerMetadata']>['provenance'];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerCitationDto)
  citations?: AnswerCitationDto[] | undefined;

  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  confidence?: NonNullable<AppendChatMessageRequest['answerMetadata']>['confidence'] | undefined;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'answerMetadata.reason must contain non-whitespace characters' })
  reason?: string | undefined;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'answerMetadata.thinkingText must contain non-whitespace characters' })
  thinkingText?: string | undefined;
}

export class AppendMessageDto {
  @IsUUID()
  chatId!: string;

  @IsIn(['user', 'assistant'])
  role!: AppendChatMessageRequest['role'];

  @IsString()
  @Matches(/\S/, { message: 'contentText must contain non-whitespace characters' })
  contentText!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AnswerMetadataDto)
  answerMetadata?: AnswerMetadataDto | undefined;
}
