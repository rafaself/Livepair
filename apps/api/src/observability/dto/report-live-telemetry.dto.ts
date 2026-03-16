import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDefined,
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import type { LiveTelemetryEventType } from '@livepair/shared-types';

const LIVE_TELEMETRY_EVENT_TYPES = [
  'live_session_started',
  'live_session_connected',
  'live_session_resumed',
  'live_usage_reported',
  'live_session_error',
  'live_session_ended',
] as const satisfies readonly LiveTelemetryEventType[];

class LiveTelemetryUsageDetailDto {
  @IsString()
  @Matches(/\S/, { message: 'events[].usage.responseTokensDetails[].modality must contain non-whitespace characters' })
  @MaxLength(64)
  modality!: string;

  @IsInt()
  @Min(0)
  tokenCount!: number;
}

class LiveTelemetryUsageDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  totalTokenCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  promptTokenCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  responseTokenCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokenCount?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokenCount?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => LiveTelemetryUsageDetailDto)
  responseTokensDetails?: LiveTelemetryUsageDetailDto[];
}

class LiveTelemetryEventDto {
  @IsIn(LIVE_TELEMETRY_EVENT_TYPES)
  eventType!: LiveTelemetryEventType;

  @IsISO8601()
  occurredAt!: string;

  @IsString()
  @Matches(/\S/, { message: 'events[].sessionId must contain non-whitespace characters' })
  @MaxLength(128)
  sessionId!: string;

  @IsString()
  @Matches(/\S/, { message: 'events[].chatId must contain non-whitespace characters' })
  @MaxLength(128)
  chatId!: string;

  @IsString()
  @Matches(/\S/, { message: 'events[].environment must contain non-whitespace characters' })
  @MaxLength(64)
  environment!: string;

  @IsString()
  @Matches(/\S/, { message: 'events[].platform must contain non-whitespace characters' })
  @MaxLength(64)
  platform!: string;

  @IsString()
  @Matches(/\S/, { message: 'events[].appVersion must contain non-whitespace characters' })
  @MaxLength(64)
  appVersion!: string;

  @IsString()
  @Matches(/\S/, { message: 'events[].model must contain non-whitespace characters' })
  @MaxLength(128)
  model!: string;

  @ValidateIf(
    (event: LiveTelemetryEventDto) =>
      event.eventType === 'live_session_connected' ||
      event.eventType === 'live_session_resumed',
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  connectLatencyMs?: number;

  @ValidateIf(
    (event: LiveTelemetryEventDto) =>
      event.eventType === 'live_session_resumed' ||
      event.eventType === 'live_session_ended',
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  resumeCount?: number;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_usage_reported')
  @IsDefined()
  @ValidateNested()
  @Type(() => LiveTelemetryUsageDto)
  usage?: LiveTelemetryUsageDto;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_session_error')
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'events[].errorCode must contain non-whitespace characters' })
  @MaxLength(64)
  errorCode?: string;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_session_error')
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'events[].errorMessage must contain non-whitespace characters' })
  @MaxLength(512)
  errorMessage?: string;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_session_ended')
  @IsOptional()
  @IsInt()
  @Min(0)
  firstResponseLatencyMs?: number;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_session_ended')
  @IsOptional()
  @IsInt()
  @Min(0)
  durationMs?: number;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_session_ended')
  @IsOptional()
  @IsInt()
  @Min(0)
  interruptionCount?: number;

  @ValidateIf((event: LiveTelemetryEventDto) => event.eventType === 'live_session_ended')
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'events[].closeReason must contain non-whitespace characters' })
  @MaxLength(128)
  closeReason?: string;
}

export class ReportLiveTelemetryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => LiveTelemetryEventDto)
  events!: LiveTelemetryEventDto[];
}
