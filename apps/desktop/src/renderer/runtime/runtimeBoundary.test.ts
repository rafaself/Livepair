import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function collectRuntimeFiles(rootDir: string): string[] {
  const entries = readdirSync(rootDir, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = join(rootDir, entry.name);

    if (entry.isDirectory()) {
      return collectRuntimeFiles(entryPath);
    }

    if (
      !entry.name.endsWith('.ts')
      && !entry.name.endsWith('.tsx')
      || entry.name.endsWith('.test.ts')
      || entry.name.endsWith('.test.tsx')
    ) {
      return [];
    }

    return [entryPath];
  });
}

const runtimeRootDir = join(process.cwd(), 'src/renderer/runtime');
const engineSubtrees = [
  'audio',
  'conversation',
  'core',
  'screen',
  'session',
  'speech',
  'text',
  'transport',
  'voice',
];

describe('runtime boundary', () => {
  it('keeps host-only globals and stores out of engine modules', () => {
    const engineFiles = engineSubtrees.flatMap((subtree) =>
      collectRuntimeFiles(join(runtimeRootDir, subtree)),
    );
    const forbiddenPatterns = [
      { pattern: /\bwindow\.bridge\b/, description: 'window.bridge' },
      { pattern: /\bnavigator\./, description: 'navigator' },
      { pattern: /\bimport\.meta\.env\b/, description: 'import.meta.env' },
      { pattern: /\buseUiStore\b/, description: 'useUiStore' },
      { pattern: /state\/assistantUiState/, description: 'UI assistant state type' },
      { pattern: /package\.json/, description: 'package.json import' },
      { pattern: /from ['"]react['"]/, description: 'React import' },
      { pattern: /from ['"].*components\//, description: 'component import' },
    ];

    const violations = engineFiles.flatMap((filePath) => {
      const contents = readFileSync(filePath, 'utf8');

      return forbiddenPatterns.flatMap(({ pattern, description }) =>
        pattern.test(contents)
          ? [`${filePath.replace(runtimeRootDir, '')}: ${description}`]
          : [],
      );
    });

    expect(violations).toEqual([]);
  });

  it('keeps sessionController.ts as a thin host composition entrypoint', () => {
    const filePath = join(runtimeRootDir, 'sessionController.ts');
    const contents = readFileSync(filePath, 'utf8');

    expect(contents).not.toMatch(/\bwindow\.bridge\b/);
    expect(contents).not.toMatch(/\bnavigator\./);
    expect(contents).not.toMatch(/\buseSessionStore\b/);
    expect(contents).not.toMatch(/\buseSettingsStore\b/);
    expect(contents).not.toMatch(/\buseUiStore\b/);
    expect(contents).not.toMatch(/\buseCaptureExclusionRectsStore\b/);
    expect(contents).not.toMatch(/\bimport\.meta\.env\b/);
    expect(contents).not.toMatch(/package\.json/);
  });
});
