import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  SaveScreenFrameDumpFrameRequest,
  ScreenFrameDumpSessionInfo,
} from '../../shared';

const CURRENT_DEBUG_SESSION_DIR = 'current-debug-session';

function sanitizeTimestamp(timestamp: string): string {
  return timestamp.replaceAll(':', '-');
}

function toFrameDumpSuffix(reason: SaveScreenFrameDumpFrameRequest['reason']): string {
  return reason === 'manual' ? 'sent' : reason;
}

export type ScreenFrameDumpService = {
  startSession: () => Promise<ScreenFrameDumpSessionInfo>;
  saveFrame: (request: SaveScreenFrameDumpFrameRequest) => Promise<void>;
};

export function createScreenFrameDumpService({
  rootDir,
}: {
  rootDir: string;
}): ScreenFrameDumpService {
  const currentSessionDirectoryPath = join(rootDir, CURRENT_DEBUG_SESSION_DIR);
  let hasStartedSession = false;

  return {
    startSession: async () => {
      await rm(currentSessionDirectoryPath, { recursive: true, force: true });
      await mkdir(currentSessionDirectoryPath, { recursive: true });
      hasStartedSession = true;

      return {
        directoryPath: currentSessionDirectoryPath,
      };
    },
    saveFrame: async ({ sequence, data, savedAt, mode, quality, reason }) => {
      if (!hasStartedSession) {
        throw new Error('Screen frame dump session has not been started');
      }

      const fileName = [
        sanitizeTimestamp(savedAt),
        mode,
        quality,
        toFrameDumpSuffix(reason),
        `seq${String(sequence).padStart(6, '0')}`,
      ].join('_') + '.jpg';
      await writeFile(join(currentSessionDirectoryPath, fileName), Buffer.from(data));
    },
  };
}
