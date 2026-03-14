import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const DESKTOP_PACKAGE_NAME = '@livepair/desktop';

function readPackageName(packageJsonPath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      name?: unknown;
    };
    return typeof parsed.name === 'string' ? parsed.name : null;
  } catch {
    return null;
  }
}

function resolveDesktopProjectRoot(appPath: string): string | null {
  let currentPath = resolve(appPath);

  while (true) {
    const packageJsonPath = join(currentPath, 'package.json');

    if (
      !currentPath.includes('.asar')
      && existsSync(packageJsonPath)
      && readPackageName(packageJsonPath) === DESKTOP_PACKAGE_NAME
    ) {
      return currentPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }
    currentPath = parentPath;
  }
}

export function resolveScreenFrameDumpRootDir({
  appPath,
  tempPath,
}: {
  appPath: string;
  tempPath: string;
}): string {
  const desktopProjectRoot = resolveDesktopProjectRoot(appPath);

  if (desktopProjectRoot !== null) {
    return join(desktopProjectRoot, 'frames', 'screen-frame-dumps');
  }

  return join(tempPath, 'livepair', 'screen-frame-dumps');
}
