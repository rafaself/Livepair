import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import type { ProjectKnowledgeSearchResult } from '@livepair/shared-types';
import { InstallSecretAuthGuard } from '../observability/install-secret-auth.guard';
import { SearchProjectKnowledgeDto } from './dto/search-project-knowledge.dto';
import { ProjectKnowledgeRateLimitGuard } from './project-knowledge-rate-limit.guard';
import { ProjectKnowledgeService } from './project-knowledge.service';

@Controller('project-knowledge')
export class ProjectKnowledgeController {
  constructor(
    private readonly projectKnowledgeService: ProjectKnowledgeService,
  ) {}

  @Post('search')
  @UseGuards(InstallSecretAuthGuard, ProjectKnowledgeRateLimitGuard)
  search(
    @Body() dto: SearchProjectKnowledgeDto,
  ): Promise<ProjectKnowledgeSearchResult> {
    return this.projectKnowledgeService.searchProjectKnowledge(dto);
  }
}
