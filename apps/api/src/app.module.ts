import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { SessionModule } from './session/session.module';

@Module({
  imports: [HealthModule, ObservabilityModule, SessionModule],
})
export class AppModule {}
