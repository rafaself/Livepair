import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { CreateEphemeralTokenResponse } from '@livepair/shared-types';
import {
  CreateEphemeralTokenDto,
  toCreateEphemeralTokenRequest,
} from './dto/create-ephemeral-token.dto';
import { SessionService } from './session.service';
import { SessionTokenRateLimitGuard } from './session-token-rate-limit.guard';
import { InstallSecretAuthGuard } from '../observability/install-secret-auth.guard';

@Controller('session')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('token')
  @UseGuards(InstallSecretAuthGuard, SessionTokenRateLimitGuard)
  createToken(
    @Body() dto: CreateEphemeralTokenDto,
  ): Promise<CreateEphemeralTokenResponse> {
    return this.sessionService.createEphemeralToken(toCreateEphemeralTokenRequest(dto));
  }
}
