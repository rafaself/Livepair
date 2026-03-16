import { Injectable } from '@nestjs/common';
import type { ProjectKnowledgeCorpusDocument } from './project-knowledge-corpus';
import { buildProjectKnowledgeCorpus } from './project-knowledge-corpus';

@Injectable()
export class ProjectKnowledgeCorpusService {
  listDocuments(): Promise<ProjectKnowledgeCorpusDocument[]> {
    return buildProjectKnowledgeCorpus();
  }
}
