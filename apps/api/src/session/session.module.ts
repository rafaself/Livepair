import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { GeminiAuthTokenClient } from './gemini-auth-token.client';
import { GeminiTextClient } from './gemini-text.client';
import { SessionService } from './session.service';

@Module({
  controllers: [SessionController],
  providers: [
    {
      provide: GeminiAuthTokenClient,
      useFactory: () => new GeminiAuthTokenClient(),
    },
    {
      provide: GeminiTextClient,
      useFactory: () => new GeminiTextClient(),
    },
    SessionService,
  ],
})
export class SessionModule {}
