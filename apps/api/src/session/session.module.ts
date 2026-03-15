import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { SessionController } from './session.controller';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';
import { SessionService } from './session.service';
import { SessionTokenAuthGuard } from './session-token-auth.guard';
import { SessionTokenCacheControlMiddleware } from './session-token-cache-control.middleware';
import { SessionTokenRateLimitGuard } from './session-token-rate-limit.guard';

@Module({
  imports: [ObservabilityModule],
  controllers: [SessionController],
  providers: [
    GeminiAuthTokenClient,
    SessionService,
    SessionTokenAuthGuard,
    SessionTokenCacheControlMiddleware,
    SessionTokenRateLimitGuard,
  ],
})
export class SessionModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SessionTokenCacheControlMiddleware).forRoutes({
      path: 'session/token',
      method: RequestMethod.POST,
    });
  }
}
