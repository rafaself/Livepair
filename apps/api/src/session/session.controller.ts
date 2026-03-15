import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import { CreateEphemeralTokenDto } from './dto/create-ephemeral-token.dto';
import { SessionService } from './session.service';
import { SessionTokenAuthGuard } from './session-token-auth.guard';
import { SessionTokenRateLimitGuard } from './session-token-rate-limit.guard';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('token')
  @UseGuards(SessionTokenAuthGuard, SessionTokenRateLimitGuard)
  createToken(
    @Body() dto: CreateEphemeralTokenDto,
  ): Promise<CreateEphemeralTokenResponse> {
    return this.sessionService.createEphemeralToken(dto);
  }
}
