import { Module } from '@nestjs/common';
import { ChatMemoryModule } from './chat-memory/chat-memory.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ObservabilityModule } from './observability/observability.module';
import { ProjectKnowledgeModule } from './project-knowledge/project-knowledge.module';
import { SessionModule } from './session/session.module';

@Module({
  imports: [
    ChatMemoryModule,
    DatabaseModule,
    HealthModule,
    ObservabilityModule,
    ProjectKnowledgeModule,
    SessionModule,
  ],
})
export class AppModule {}
