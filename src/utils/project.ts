/**
 * Project context detection utilities
 * Detects project information from the current working directory
 */

import { existsSync, readFileSync } from 'fs';
import { basename, join } from 'path';

export interface ProjectContext {
  name: string;
  path: string;
  type?: 'node' | 'python' | 'rust' | 'go' | 'other';
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'cargo' | 'go';
  description?: string;
  version?: string;
  hasGit?: boolean;
  gitRemote?: string;
  gitBranch?: string;
}

/**
 * Detect project context from current directory
 */
export function detectProject(cwd: string = process.cwd()): ProjectContext {
  const context: ProjectContext = {
    name: basename(cwd),
    path: cwd,
  };

  // Check for Node.js project
  const packageJsonPath = join(cwd, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      context.type = 'node';
      context.name = packageJson.name || context.name;
      context.description = packageJson.description;
      context.version = packageJson.version;

      // Detect package manager
      if (existsSync(join(cwd, 'pnpm-lock.yaml'))) {
        context.packageManager = 'pnpm';
      } else if (existsSync(join(cwd, 'yarn.lock'))) {
        context.packageManager = 'yarn';
      } else if (existsSync(join(cwd, 'package-lock.json'))) {
        context.packageManager = 'npm';
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for Python project
  if (!context.type) {
    const pyprojectPath = join(cwd, 'pyproject.toml');
    const setupPyPath = join(cwd, 'setup.py');
    const requirementsPath = join(cwd, 'requirements.txt');

    if (existsSync(pyprojectPath) || existsSync(setupPyPath) || existsSync(requirementsPath)) {
      context.type = 'python';
      context.packageManager = 'pip';
    }
  }

  // Check for Rust project
  if (!context.type) {
    const cargoPath = join(cwd, 'Cargo.toml');
    if (existsSync(cargoPath)) {
      context.type = 'rust';
      context.packageManager = 'cargo';
      try {
        const cargoContent = readFileSync(cargoPath, 'utf-8');
        const nameMatch = cargoContent.match(/name\s*=\s*"([^"]+)"/);
        const versionMatch = cargoContent.match(/version\s*=\s*"([^"]+)"/);
        if (nameMatch) context.name = nameMatch[1];
        if (versionMatch) context.version = versionMatch[1];
      } catch {
        // Ignore parse errors
      }
    }
  }

  // Check for Go project
  if (!context.type) {
    const goModPath = join(cwd, 'go.mod');
    if (existsSync(goModPath)) {
      context.type = 'go';
      context.packageManager = 'go';
    }
  }

  // Check for Git
  const gitPath = join(cwd, '.git');
  if (existsSync(gitPath)) {
    context.hasGit = true;

    // Try to get git remote
    try {
      const gitConfigPath = join(gitPath, 'config');
      if (existsSync(gitConfigPath)) {
        const gitConfig = readFileSync(gitConfigPath, 'utf-8');
        const remoteMatch = gitConfig.match(/url\s*=\s*(.+)/);
        if (remoteMatch) {
          context.gitRemote = remoteMatch[1].trim();
        }
      }

      // Try to get current branch
      const headPath = join(gitPath, 'HEAD');
      if (existsSync(headPath)) {
        const headContent = readFileSync(headPath, 'utf-8').trim();
        if (headContent.startsWith('ref: refs/heads/')) {
          context.gitBranch = headContent.replace('ref: refs/heads/', '');
        }
      }
    } catch {
      // Ignore errors
    }
  }

  // Default type
  if (!context.type) {
    context.type = 'other';
  }

  return context;
}

/**
 * Generate a unique project identifier
 * Used for associating tasks with a specific project
 */
export function getProjectId(context: ProjectContext): string {
  // Use git remote if available
  if (context.gitRemote) {
    // Normalize git remote URL to create consistent ID
    let remote = context.gitRemote;
    remote = remote.replace(/^(git@|https?:\/\/)/, '');
    remote = remote.replace(/\.git$/, '');
    remote = remote.replace(/:/g, '/');
    return remote;
  }

  // Fall back to project name + path hash
  const pathHash = Buffer.from(context.path).toString('base64').slice(0, 8);
  return `${context.name}-${pathHash}`;
}

/**
 * Check if we're in a project directory
 */
export function isInProject(cwd: string = process.cwd()): boolean {
  const context = detectProject(cwd);
  return context.type !== 'other' || context.hasGit === true;
}
