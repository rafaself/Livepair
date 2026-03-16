import { Body, Controller, Post } from '@nestjs/common';
import type { ProjectKnowledgeSearchResult } from '@livepair/shared-types';
import { SearchProjectKnowledgeDto } from './dto/search-project-knowledge.dto';
import { ProjectKnowledgeService } from './project-knowledge.service';

@Controller('project-knowledge')
export class ProjectKnowledgeController {
  constructor(
    private readonly projectKnowledgeService: ProjectKnowledgeService,
  ) {}

  @Post('search')
  search(
    @Body() dto: SearchProjectKnowledgeDto,
  ): Promise<ProjectKnowledgeSearchResult> {
    return this.projectKnowledgeService.searchProjectKnowledge(dto);
  }
}
