import { IsString, Matches } from 'class-validator';
import type { ProjectKnowledgeSearchRequest } from '@livepair/shared-types';

export class SearchProjectKnowledgeDto {
  @IsString()
  @Matches(/\S/, { message: 'query must contain non-whitespace characters' })
  query!: ProjectKnowledgeSearchRequest['query'];
}
