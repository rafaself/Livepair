import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { SessionModule } from './session/session.module';

@Module({
  imports: [DatabaseModule, HealthModule, ObservabilityModule, SessionModule],
})
export class AppModule {}
