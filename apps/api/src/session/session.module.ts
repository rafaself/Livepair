import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { SessionController } from './session.controller';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';
import { SessionService } from './session.service';
import { SessionTokenAuthGuard } from './session-token-auth.guard';

@Module({
  imports: [ObservabilityModule],
  controllers: [SessionController],
  providers: [GeminiAuthTokenClient, SessionService, SessionTokenAuthGuard],
})
export class SessionModule {}
