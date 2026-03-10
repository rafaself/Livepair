import { Body, Controller, Post } from '@nestjs/common';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import { CreateEphemeralTokenDto } from './dto/create-ephemeral-token.dto';
import { SessionService } from './session.service';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('token')
  createToken(
    @Body() dto: CreateEphemeralTokenDto,
  ): Promise<CreateEphemeralTokenResponse> {
    return this.sessionService.createEphemeralToken(dto);
  }
}
