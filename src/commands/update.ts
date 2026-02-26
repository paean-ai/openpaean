/**
 * Update Command
 * Self-update the OpenPaean CLI to the latest version via the detected package manager
 */

import { Command } from 'commander';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as output from '../utils/output.js';

const NPM_REGISTRY_URL = 'https://registry.npmjs.org/openpaean/latest';
const PACKAGE_NAME = 'openpaean';

function getCurrentVersion(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
  return pkg.version;
}

async function getLatestVersion(): Promise<string> {
  const res = await fetch(NPM_REGISTRY_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch latest version: ${res.statusText}`);
  }
  const data = await res.json() as { version: string };
  return data.version;
}

function detectPackageManager(): { name: string; command: string } {
  const managers = [
    { name: 'bun', command: `bun add -g ${PACKAGE_NAME}@latest` },
    { name: 'pnpm', command: `pnpm add -g ${PACKAGE_NAME}@latest` },
    { name: 'yarn', command: `yarn global add ${PACKAGE_NAME}@latest` },
    { name: 'npm', command: `npm install -g ${PACKAGE_NAME}@latest` },
  ];

  for (const pm of managers) {
    try {
      execSync(`command -v ${pm.name}`, { stdio: 'ignore' });
      return pm;
    } catch {
      // not found, try next
    }
  }

  return managers[managers.length - 1]; // fallback to npm
}

function compareVersions(current: string, latest: string): number {
  const a = current.split('.').map(Number);
  const b = latest.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) < (b[i] ?? 0)) return -1;
    if ((a[i] ?? 0) > (b[i] ?? 0)) return 1;
  }
  return 0;
}

export const updateCommand = new Command('update')
  .description('Update OpenPaean CLI to the latest version')
  .option('--check', 'Check for updates without installing')
  .action(async (options) => {
    const currentVersion = getCurrentVersion();
    output.info(`Current version: ${currentVersion}`);

    let latestVersion: string;
    try {
      latestVersion = await getLatestVersion();
    } catch (err) {
      output.error(`Failed to check for updates: ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }

    const cmp = compareVersions(currentVersion, latestVersion);

    if (cmp >= 0) {
      output.success(`Already up to date (v${currentVersion})`);
      return;
    }

    output.info(`New version available: ${currentVersion} → ${latestVersion}`);

    if (options.check) {
      output.dim(`Run "openpaean update" to install the latest version.`);
      return;
    }

    const pm = detectPackageManager();
    output.info(`Updating via ${pm.name}...`);

    try {
      execSync(pm.command, { stdio: 'inherit' });
      output.success(`Successfully updated to v${latestVersion}`);
    } catch {
      output.error(`Update failed. You can try manually:`);
      output.dim(`  ${pm.command}`);
      process.exit(1);
    }
  });
