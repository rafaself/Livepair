import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  SaveScreenFrameDumpFrameRequest,
  ScreenFrameDumpSessionInfo,
} from '../../shared';

const CURRENT_DEBUG_SESSION_DIR = 'current-debug-session';

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
    saveFrame: async ({ sequence, data }) => {
      if (!hasStartedSession) {
        throw new Error('Screen frame dump session has not been started');
      }

      const fileName = `frame-${String(sequence).padStart(6, '0')}.jpg`;
      await writeFile(join(currentSessionDirectoryPath, fileName), Buffer.from(data));
    },
  };
}
