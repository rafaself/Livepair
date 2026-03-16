import { Module } from '@nestjs/common';
import { ProjectKnowledgeController } from './project-knowledge.controller';
import { ProjectKnowledgeCorpusService } from './project-knowledge-corpus.service';
import { ProjectKnowledgeGeminiClient } from './project-knowledge-gemini.client';
import { ProjectKnowledgeService } from './project-knowledge.service';

@Module({
  controllers: [ProjectKnowledgeController],
  providers: [
    ProjectKnowledgeCorpusService,
    ProjectKnowledgeGeminiClient,
    ProjectKnowledgeService,
  ],
  exports: [ProjectKnowledgeService],
})
export class ProjectKnowledgeModule {}
