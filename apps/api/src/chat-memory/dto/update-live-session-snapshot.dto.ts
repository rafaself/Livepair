import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import type {
  RehydrationPacketContextState,
  UpdateLiveSessionSnapshotRequest,
} from '@livepair/shared-types';

class RehydrationPacketStateEntryDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

class RehydrationPacketStateSectionDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RehydrationPacketStateEntryDto)
  entries!: RehydrationPacketContextState['task']['entries'];
}

class RehydrationPacketContextStateDto implements RehydrationPacketContextState {
  @ValidateNested()
  @Type(() => RehydrationPacketStateSectionDto)
  task!: RehydrationPacketContextState['task'];

  @ValidateNested()
  @Type(() => RehydrationPacketStateSectionDto)
  context!: RehydrationPacketContextState['context'];
}

export class UpdateLiveSessionSnapshotDto
  implements UpdateLiveSessionSnapshotRequest
{
  kind = 'snapshot' as const;

  @IsUUID()
  id!: string;

  @IsOptional()
  @IsString()
  summarySnapshot?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => RehydrationPacketContextStateDto)
  contextStateSnapshot?: RehydrationPacketContextState | null;
}
