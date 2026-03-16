import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, chmodSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');
const repoRoot = resolve(packageRoot, '..', '..');
const releaseRoot = resolve(packageRoot, 'release', 'linux', process.arch);
const stagingRoot = resolve(packageRoot, '.packaging', 'linux', process.arch);
const deployedAppDir = join(stagingRoot, 'app');
const portableDir = join(releaseRoot, 'portable', 'Livepair');
const appDirRoot = join(releaseRoot, 'Livepair.AppDir');
const debRoot = join(stagingRoot, 'deb-root');
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
const electronPackageJsonPath = require.resolve('electron/package.json');
const electronRoot = dirname(electronPackageJsonPath);
const electronDistDir = join(electronRoot, 'dist');
const iconPath = join(packageRoot, 'build', 'icon.png');
const envExamplePath = join(packageRoot, '.env.example');
const packageName = 'livepair';
const productName = 'Livepair';
const version = packageJson.version;
const debArchitecture = toDebArchitecture(process.arch);

function toDebArchitecture(arch) {
  switch (arch) {
    case 'x64':
      return 'amd64';
    case 'arm64':
      return 'arm64';
    default:
      throw new Error(`Unsupported Debian architecture: ${arch}`);
  }
}

function ensureCommand(command) {
  const result = spawnSync('bash', ['-lc', `command -v ${command}`], {
    encoding: 'utf8',
  });

  return result.status === 0;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function resetDir(targetPath) {
  rmSync(targetPath, { recursive: true, force: true });
  mkdirSync(targetPath, { recursive: true });
}

function writeExecutable(targetPath, content) {
  writeFileSync(targetPath, content, 'utf8');
  chmodSync(targetPath, 0o755);
}

function configureSandboxHelper(targetDir) {
  const chromeSandboxPath = join(targetDir, 'chrome-sandbox');

  if (!existsSync(chromeSandboxPath)) {
    return;
  }

  chmodSync(chromeSandboxPath, 0o4755);
}

function writeDesktopEntry(targetPath, execValue) {
  writeFileSync(
    targetPath,
    [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${productName}`,
      'Comment=Realtime multimodal desktop assistant',
      `Exec=${execValue}`,
      'Icon=livepair',
      'Terminal=false',
      'Categories=Utility;',
      'StartupWMClass=Livepair',
      '',
    ].join('\n'),
    'utf8',
  );
}

function stageElectronApp(targetDir) {
  resetDir(targetDir);
  cpSync(electronDistDir, targetDir, { recursive: true });
  cpSync(deployedAppDir, join(targetDir, 'resources', 'app'), { recursive: true });
  configureSandboxHelper(targetDir);
}

function writePortableBundle() {
  stageElectronApp(portableDir);
  cpSync(iconPath, join(portableDir, 'livepair.png'));
  cpSync(envExamplePath, join(portableDir, 'livepair.env.example'));
  writeDesktopEntry(join(portableDir, 'livepair.desktop'), 'livepair');
  writeExecutable(
    join(portableDir, 'livepair'),
    `#!/bin/sh
set -eu

HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ENV_FILE="$HERE/livepair.env"

if [ -f "$ENV_FILE" ]; then
  export DOTENV_CONFIG_PATH="$ENV_FILE"
fi

exec "$HERE/electron" "$HERE/resources/app" "$@"
`,
  );
}

function writeDebPackage() {
  resetDir(debRoot);

  const installDir = join(debRoot, 'usr', 'lib', packageName);
  stageElectronApp(installDir);

  mkdirSync(join(debRoot, 'usr', 'bin'), { recursive: true });
  mkdirSync(join(debRoot, 'usr', 'share', 'applications'), { recursive: true });
  mkdirSync(join(debRoot, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps'), { recursive: true });
  mkdirSync(join(debRoot, 'etc', packageName), { recursive: true });
  mkdirSync(join(debRoot, 'DEBIAN'), { recursive: true });

  cpSync(iconPath, join(debRoot, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps', 'livepair.png'));
  cpSync(envExamplePath, join(debRoot, 'etc', packageName, 'livepair.env.example'));
  writeDesktopEntry(join(debRoot, 'usr', 'share', 'applications', 'livepair.desktop'), '/usr/bin/livepair');
  writeExecutable(
    join(debRoot, 'usr', 'bin', 'livepair'),
    `#!/bin/sh
set -eu

ENV_FILE="/etc/${packageName}/livepair.env"

if [ -f "$ENV_FILE" ]; then
  export DOTENV_CONFIG_PATH="$ENV_FILE"
fi

exec "/usr/lib/${packageName}/electron" "/usr/lib/${packageName}/resources/app" "$@"
`,
  );

  writeFileSync(
    join(debRoot, 'DEBIAN', 'control'),
    [
      `Package: ${packageName}`,
      `Version: ${version}`,
      'Section: utils',
      'Priority: optional',
      `Architecture: ${debArchitecture}`,
      'Maintainer: Livepair',
      'Depends: libasound2t64 | libasound2, libatk-bridge2.0-0, libc6, libdrm2, libgbm1, libgtk-3-0, libnotify4, libnss3, libx11-6, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0, libxrandr2, libxshmfence1, libxss1, libxtst6, xdg-utils',
      'Description: Livepair desktop assistant',
      ' Realtime multimodal desktop assistant for Ubuntu desktop workflows.',
      '',
    ].join('\n'),
    'utf8',
  );

  const debOutput = join(releaseRoot, `${packageName}_${version}_${debArchitecture}.deb`);
  runCommand('dpkg-deb', ['--build', '--root-owner-group', debRoot, debOutput]);
}

function writeAppDir() {
  resetDir(appDirRoot);

  const installDir = join(appDirRoot, 'usr', 'lib', packageName);
  stageElectronApp(installDir);

  mkdirSync(join(appDirRoot, 'usr', 'share', 'applications'), { recursive: true });
  mkdirSync(join(appDirRoot, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps'), { recursive: true });
  cpSync(iconPath, join(appDirRoot, 'livepair.png'));
  cpSync(iconPath, join(appDirRoot, 'usr', 'share', 'icons', 'hicolor', '512x512', 'apps', 'livepair.png'));
  cpSync(envExamplePath, join(appDirRoot, 'livepair.env.example'));

  writeDesktopEntry(join(appDirRoot, 'livepair.desktop'), 'AppRun');
  writeDesktopEntry(join(appDirRoot, 'usr', 'share', 'applications', 'livepair.desktop'), 'AppRun');
  writeExecutable(
    join(appDirRoot, 'AppRun'),
    `#!/bin/sh
set -eu

HERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ENV_FILE="$HERE/livepair.env"

if [ -f "$ENV_FILE" ]; then
  export DOTENV_CONFIG_PATH="$ENV_FILE"
fi

exec "$HERE/usr/lib/${packageName}/electron" "$HERE/usr/lib/${packageName}/resources/app" "$@"
`,
  );
}

function validateDesktopFiles() {
  if (!ensureCommand('desktop-file-validate')) {
    return;
  }

  runCommand('desktop-file-validate', [join(portableDir, 'livepair.desktop')]);
  runCommand('desktop-file-validate', [join(appDirRoot, 'livepair.desktop')]);
  runCommand('desktop-file-validate', [join(debRoot, 'usr', 'share', 'applications', 'livepair.desktop')]);
}

function maybeBuildAppImage() {
  if (!ensureCommand('appimagetool')) {
    console.warn(
      '[livepair] appimagetool not found; leaving AppDir staged at',
      appDirRoot,
    );
    return;
  }

  const appImageOutput = join(releaseRoot, `${productName}-${version}-${process.arch}.AppImage`);
  runCommand('appimagetool', [appDirRoot, appImageOutput]);
}

function main() {
  if (!existsSync(iconPath)) {
    throw new Error(`Missing Linux icon asset at ${iconPath}`);
  }

  resetDir(releaseRoot);
  resetDir(stagingRoot);

  runCommand('pnpm', ['--filter', '@livepair/desktop', 'deploy', '--prod', deployedAppDir]);
  writePortableBundle();
  writeDebPackage();
  writeAppDir();
  validateDesktopFiles();
  maybeBuildAppImage();
  rmSync(stagingRoot, { recursive: true, force: true });

  console.log(`[livepair] Linux artifacts written to ${releaseRoot}`);
}

main();
