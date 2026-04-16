import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { ProjectKnowledgeController } from './project-knowledge.controller';
import { ProjectKnowledgeCorpusService } from './project-knowledge-corpus.service';
import { ProjectKnowledgeGeminiClient } from './project-knowledge-gemini.client';
import { ProjectKnowledgeRateLimitGuard } from './project-knowledge-rate-limit.guard';
import { ProjectKnowledgeService } from './project-knowledge.service';

@Module({
  imports: [ObservabilityModule],
  controllers: [ProjectKnowledgeController],
  providers: [
    ProjectKnowledgeCorpusService,
    ProjectKnowledgeGeminiClient,
    ProjectKnowledgeRateLimitGuard,
    ProjectKnowledgeService,
  ],
  exports: [ProjectKnowledgeService],
})
export class ProjectKnowledgeModule {}
