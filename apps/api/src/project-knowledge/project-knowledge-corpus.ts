import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { resolve } from 'path';

export type ProjectKnowledgeCorpusManifestEntry = {
  id: string;
  relativePath: string;
};

export type ProjectKnowledgeCorpusDocument = ProjectKnowledgeCorpusManifestEntry & {
  title: string;
  absolutePath: string;
  mimeType: string;
  contentHash: string;
};

const REPO_ROOT = resolve(__dirname, '../../../../');

// Keep this intentionally small and explicit. Wave 2 is a narrow curated corpus,
// not an auto-index of the whole repository.
export const PROJECT_KNOWLEDGE_CORPUS_MANIFEST: readonly ProjectKnowledgeCorpusManifestEntry[] = [
  { id: 'repo-readme', relativePath: 'README.md' },
  { id: 'watchouts', relativePath: 'WATCHOUTS.md' },
  { id: 'root-agents', relativePath: 'AGENTS.md' },
  { id: 'architecture', relativePath: 'docs/ARCHITECTURE.md' },
  { id: 'docs-audit', relativePath: 'docs/AUDIT.md' },
  { id: 'milestone-matrix', relativePath: 'docs/MILESTONE_MATRIX.md' },
  { id: 'live-preferences-audit', relativePath: 'docs/GEMINI_LIVE_PREFERENCES_AUDIT.md' },
  { id: 'api-agents', relativePath: 'apps/api/AGENTS.md' },
  { id: 'desktop-agents', relativePath: 'apps/desktop/AGENTS.md' },
  { id: 'shared-types-agents', relativePath: 'packages/shared-types/AGENTS.md' },
] as const;

function inferMimeType(relativePath: string): string {
  if (relativePath.endsWith('.md')) {
    return 'text/markdown';
  }

  if (relativePath.endsWith('.txt')) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function buildProjectKnowledgeCorpus(
  repoRoot = REPO_ROOT,
): Promise<ProjectKnowledgeCorpusDocument[]> {
  return Promise.all(
    PROJECT_KNOWLEDGE_CORPUS_MANIFEST.map(async (entry) => {
      const absolutePath = resolve(repoRoot, entry.relativePath);
      const contents = await readFile(absolutePath);

      return {
        ...entry,
        title: entry.relativePath,
        absolutePath,
        mimeType: inferMimeType(entry.relativePath),
        contentHash: sha256(contents),
      };
    }),
  );
}
