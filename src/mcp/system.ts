/**
 * System/Shell MCP Tools (Open Source)
 * 
 * Provides controlled shell execution, filesystem operations, and process
 * management capabilities for the OpenPaean CLI.
 * 
 * This is the open-source foundation for local tool execution.
 * For advanced features (autonomous worker, CLI agent orchestration),
 * see the commercial Paean CLI.
 * 
 * Security:
 * - Command whitelist for autonomous/safe execution
 * - Dangerous pattern detection
 * - System path write protection
 * - Input sanitization for process names
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { createWriteStream } from 'fs';
import { writeFile, readFile, mkdir, readdir, stat, appendFile } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { basename, join, resolve, dirname } from 'path';

const execAsync = promisify(exec);

/**
 * Command whitelist for autonomous mode
 * These commands are considered safe to execute without user confirmation
 */
const COMMAND_WHITELIST = new Set([
    // Package managers
    'npm', 'bun', 'bunx', 'npx', 'pnpm', 'yarn',
    // Runtime
    'node', 'deno', 'tsx',
    // Version control
    'git',
    // Build tools
    'tsc', 'esbuild', 'vite', 'webpack',
    // Testing
    'vitest', 'jest', 'mocha',
    // AI coding agents
    'a8e', 'claude', 'codex', 'gemini', 'opencode',
    // Basic utilities (read-only)
    'echo', 'cat', 'ls', 'pwd', 'which', 'head', 'tail', 'grep', 'find', 'wc',
    // Process inspection
    'ps', 'pgrep', 'lsof',
]);

/**
 * Dangerous command patterns that should never be executed
 */
const DANGEROUS_PATTERNS = [
    /rm\s+-rf?\s+[\/~]/, // rm -rf / or ~
    /:(){ :|:& };:/,      // Fork bomb
    />\s*\/dev\/sd/,      // Write to disk
    /mkfs\./,             // Format disk
    /dd\s+if=/,           // Direct disk write
];

/**
 * Check if a command is in the whitelist
 */
export function isCommandWhitelisted(command: string): boolean {
    const baseCommand = command.trim().split(/\s+/)[0];
    // Handle path prefixes like /usr/bin/node
    const cmdName = baseCommand.split('/').pop() || baseCommand;
    return COMMAND_WHITELIST.has(cmdName);
}

/**
 * Check if a command contains dangerous patterns
 */
export function isDangerousCommand(command: string): boolean {
    return DANGEROUS_PATTERNS.some(pattern => pattern.test(command));
}

/**
 * System MCP Tools definition (open-source shell & filesystem tools)
 */
export function getSystemTools(): Tool[] {
    return [
        {
            name: 'paean_execute_shell',
            description:
                'Execute a shell command on the local machine. ' +
                'In autonomous mode, only whitelisted commands (npm, bun, git, node, etc.) are allowed. ' +
                'Use this to run tests, build projects, or inspect the system.',
            inputSchema: {
                type: 'object',
                properties: {
                    command: {
                        type: 'string',
                        description: 'The command to execute (e.g., "npm test", "bun run build")',
                    },
                    cwd: {
                        type: 'string',
                        description: 'Working directory for the command (optional)',
                    },
                    background: {
                        type: 'boolean',
                        description: 'Run in background (detached mode). Useful for starting long-running services.',
                    },
                    timeout: {
                        type: 'number',
                        description: 'Timeout in milliseconds (default: 60000, max: 300000)',
                    },
                },
                required: ['command'],
            },
        },
        {
            name: 'paean_check_process',
            description:
                'Check if a process is running by name or PID. ' +
                'Use this to verify if a service or dev server is running.',
            inputSchema: {
                type: 'object',
                properties: {
                    name: {
                        type: 'string',
                        description: 'Process name to search for (e.g., "node", "vite")',
                    },
                    pid: {
                        type: 'number',
                        description: 'Process ID to check',
                    },
                },
            },
        },
        {
            name: 'paean_kill_process',
            description:
                'Terminate a process by PID. Use SIGTERM for graceful shutdown or SIGKILL for force kill.',
            inputSchema: {
                type: 'object',
                properties: {
                    pid: {
                        type: 'number',
                        description: 'Process ID to terminate',
                    },
                    signal: {
                        type: 'string',
                        enum: ['SIGTERM', 'SIGKILL', 'SIGINT'],
                        description: 'Signal to send (default: SIGTERM)',
                    },
                },
                required: ['pid'],
            },
        },
        {
            name: 'paean_download_file',
            description:
                'Download a file from a URL to the local filesystem. ' +
                'Supports HTTPS URLs. Useful for downloading assets, documents, or other files.',
            inputSchema: {
                type: 'object',
                properties: {
                    url: {
                        type: 'string',
                        description: 'The URL to download from (supports HTTPS)',
                    },
                    filename: {
                        type: 'string',
                        description: 'Optional filename for the downloaded file.',
                    },
                    directory: {
                        type: 'string',
                        description: 'Optional target directory path. Defaults to current working directory.',
                    },
                },
                required: ['url'],
            },
        },
        {
            name: 'paean_write_file',
            description:
                'Write content to a file on the local filesystem. ' +
                'Creates parent directories automatically. Supports append mode.',
            inputSchema: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Absolute or relative path to write to',
                    },
                    content: {
                        type: 'string',
                        description: 'The text content to write to the file',
                    },
                    append: {
                        type: 'boolean',
                        description: 'If true, append to file instead of overwriting (default: false)',
                    },
                    encoding: {
                        type: 'string',
                        description: 'File encoding (default: utf-8)',
                    },
                },
                required: ['filePath', 'content'],
            },
        },
        {
            name: 'paean_read_file',
            description:
                'Read the contents of a file from the local filesystem. ' +
                'Supports offset and limit for reading large files in chunks.',
            inputSchema: {
                type: 'object',
                properties: {
                    filePath: {
                        type: 'string',
                        description: 'Absolute or relative path to read from',
                    },
                    offset: {
                        type: 'number',
                        description: 'Line number to start reading from (0-based, default: 0)',
                    },
                    limit: {
                        type: 'number',
                        description: 'Maximum number of lines to read (default: all)',
                    },
                    encoding: {
                        type: 'string',
                        description: 'File encoding (default: utf-8)',
                    },
                },
                required: ['filePath'],
            },
        },
        {
            name: 'paean_list_directory',
            description:
                'List files and directories at a given path. ' +
                'Returns names, types (file/directory), and sizes. Supports recursive listing and glob patterns.',
            inputSchema: {
                type: 'object',
                properties: {
                    dirPath: {
                        type: 'string',
                        description: 'Directory path to list (default: current working directory)',
                    },
                    recursive: {
                        type: 'boolean',
                        description: 'If true, list recursively (default: false, max depth: 3)',
                    },
                    pattern: {
                        type: 'string',
                        description: 'Glob pattern to filter entries (e.g., "*.md", "*.ts")',
                    },
                },
            },
        },
    ];
}

/**
 * Execute a system tool
 */
export async function executeSystemTool(
    toolName: string,
    args: Record<string, unknown>,
    options?: { autonomousMode?: boolean; debug?: boolean }
): Promise<unknown> {
    const { autonomousMode = false, debug = false } = options || {};

    switch (toolName) {
        case 'paean_execute_shell':
            return executeShell(args, { autonomousMode, debug });
        case 'paean_check_process':
            return checkProcess(args);
        case 'paean_kill_process':
            return killProcess(args);
        case 'paean_download_file':
            return downloadFile(args);
        case 'paean_write_file':
            return writeLocalFile(args);
        case 'paean_read_file':
            return readLocalFile(args);
        case 'paean_list_directory':
            return listDirectory(args);
        default:
            return {
                success: false,
                error: `Unknown system tool: ${toolName}`,
            };
    }
}

/**
 * Execute a shell command
 */
async function executeShell(
    args: Record<string, unknown>,
    options: { autonomousMode?: boolean; debug?: boolean }
): Promise<unknown> {
    const command = args.command as string;
    const cwd = args.cwd as string | undefined;
    const background = args.background as boolean | undefined;
    const timeout = Math.min((args.timeout as number) || 60000, 300000); // Max 5 minutes

    if (!command) {
        return { success: false, error: 'Command is required' };
    }

    // Security checks
    if (isDangerousCommand(command)) {
        return {
            success: false,
            error: 'Command contains dangerous patterns and cannot be executed',
        };
    }

    // In autonomous mode, only allow whitelisted commands
    if (options.autonomousMode && !isCommandWhitelisted(command)) {
        return {
            success: false,
            error: `Command "${command.split(/\s+/)[0]}" is not in the whitelist. ` +
                `Allowed: ${Array.from(COMMAND_WHITELIST).join(', ')}`,
            requiresConfirmation: true,
        };
    }

    try {
        if (background) {
            // Detached background process
            const parts = command.split(/\s+/);
            const cmd = parts[0];
            const cmdArgs = parts.slice(1);

            const subprocess = spawn(cmd, cmdArgs, {
                cwd: cwd || process.cwd(),
                detached: true,
                stdio: 'ignore',
                shell: true,
            });
            subprocess.unref();

            return {
                success: true,
                message: 'Process started in background',
                pid: subprocess.pid,
                background: true,
            };
        } else {
            // Synchronous execution with timeout
            const { stdout, stderr } = await execAsync(command, {
                cwd: cwd || process.cwd(),
                timeout,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
            });

            return {
                success: true,
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                exitCode: 0,
            };
        }
    } catch (error: unknown) {
        const err = error as { code?: string | number; killed?: boolean; stdout?: string; stderr?: string; message?: string };

        if (err.killed) {
            return {
                success: false,
                error: `Command timed out after ${timeout}ms`,
                timedOut: true,
            };
        }

        return {
            success: false,
            error: err.message || 'Command execution failed',
            exitCode: typeof err.code === 'number' ? err.code : 1,
            stdout: err.stdout?.trim(),
            stderr: err.stderr?.trim(),
        };
    }
}

/**
 * Check if a process is running
 */
async function checkProcess(args: Record<string, unknown>): Promise<unknown> {
    const name = args.name as string | undefined;
    const pid = args.pid as number | undefined;

    if (!name && !pid) {
        return { success: false, error: 'Either name or pid is required' };
    }

    try {
        if (pid) {
            try {
                process.kill(pid, 0); // Signal 0 = check existence
                return { success: true, running: true, pid };
            } catch {
                return { success: true, running: false, pid };
            }
        } else if (name) {
            // Sanitize name to prevent command injection
            const sanitizedName = name.replace(/[^a-zA-Z0-9\-_. ]/g, '');
            if (sanitizedName !== name) {
                return {
                    success: false,
                    error: 'Process name contains invalid characters. Only alphanumeric, dash, underscore, dot, and space are allowed.',
                };
            }

            try {
                const { stdout } = await execAsync(`pgrep -f "${sanitizedName}"`);
                const pids = stdout.trim().split('\n').filter(Boolean).map(Number);
                return {
                    success: true,
                    running: pids.length > 0,
                    processName: name,
                    pids,
                    count: pids.length,
                };
            } catch {
                return {
                    success: true,
                    running: false,
                    processName: name,
                    pids: [],
                    count: 0,
                };
            }
        }
        return { success: false, error: 'Invalid arguments' };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to check process',
        };
    }
}

/**
 * Kill a process by PID
 */
async function killProcess(args: Record<string, unknown>): Promise<unknown> {
    const pid = args.pid as number;
    const signal = (args.signal as string) || 'SIGTERM';

    if (!pid) {
        return { success: false, error: 'PID is required' };
    }

    const validSignals = ['SIGTERM', 'SIGKILL', 'SIGINT'];
    if (!validSignals.includes(signal)) {
        return { success: false, error: `Invalid signal: ${signal}. Use: ${validSignals.join(', ')}` };
    }

    try {
        try {
            process.kill(pid, 0);
        } catch {
            return { success: false, error: `Process ${pid} not found` };
        }

        process.kill(pid, signal as NodeJS.Signals);

        return {
            success: true,
            message: `Sent ${signal} to process ${pid}`,
            pid,
            signal,
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to kill process',
        };
    }
}

/**
 * Download a file from a URL to the local filesystem
 */
async function downloadFile(args: Record<string, unknown>): Promise<unknown> {
    const url = args.url as string;
    const filename = args.filename as string | undefined;
    const directory = args.directory as string | undefined;

    if (!url) {
        return { success: false, error: 'URL is required' };
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
        return { success: false, error: 'Invalid URL format' };
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { success: false, error: `Unsupported protocol: ${parsedUrl.protocol}. Only HTTP/HTTPS are supported.` };
    }

    const targetDir = directory ? resolve(directory) : process.cwd();

    try {
        await mkdir(targetDir, { recursive: true });

        const response = await fetch(url, {
            headers: { 'User-Agent': 'OpenPaean-CLI/1.0' },
            signal: AbortSignal.timeout(120_000),
        });

        if (!response.ok) {
            return {
                success: false,
                error: `Download failed: HTTP ${response.status} ${response.statusText}`,
            };
        }

        // Determine filename
        let resolvedFilename = filename;

        if (!resolvedFilename) {
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const match = contentDisposition.match(/filename[^;=\n]*=(?:(\\?['"])(.*?)\1|(?:[^\s]+'.*?')?([^;\n]*))/i);
                if (match) {
                    resolvedFilename = (match[2] || match[3])?.trim();
                }
            }

            if (!resolvedFilename) {
                const urlPath = parsedUrl.pathname;
                const urlFilename = basename(urlPath);
                resolvedFilename = decodeURIComponent(urlFilename.split('?')[0]);
            }

            if (!resolvedFilename || resolvedFilename === '/' || resolvedFilename === '') {
                const contentType = response.headers.get('content-type') || '';
                const ext = contentType.includes('png') ? '.png'
                    : contentType.includes('jpeg') || contentType.includes('jpg') ? '.jpg'
                    : contentType.includes('gif') ? '.gif'
                    : contentType.includes('webp') ? '.webp'
                    : contentType.includes('svg') ? '.svg'
                    : contentType.includes('pdf') ? '.pdf'
                    : '';
                resolvedFilename = `download-${Date.now()}${ext}`;
            }
        }

        // Sanitize filename
        resolvedFilename = resolvedFilename.replace(/[/\\:\0]/g, '_');
        const filePath = join(targetDir, resolvedFilename);

        if (response.body) {
            const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
            const writeStream = createWriteStream(filePath);
            await pipeline(nodeStream, writeStream);
        } else {
            const buffer = Buffer.from(await response.arrayBuffer());
            await writeFile(filePath, buffer);
        }

        const contentLength = response.headers.get('content-length');
        const contentType = response.headers.get('content-type');

        return {
            success: true,
            message: 'File downloaded successfully',
            filePath,
            filename: resolvedFilename,
            directory: targetDir,
            size: contentLength ? parseInt(contentLength, 10) : undefined,
            contentType: contentType || undefined,
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'TimeoutError') {
            return { success: false, error: 'Download timed out after 2 minutes', timedOut: true };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Download failed',
        };
    }
}

/**
 * Get the whitelist for display/debugging
 */
export function getCommandWhitelist(): string[] {
    return Array.from(COMMAND_WHITELIST);
}

// ============================================
// Filesystem Tools
// ============================================

/**
 * Write content to a local file
 */
async function writeLocalFile(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.filePath as string;
    const content = args.content as string;
    const shouldAppend = args.append as boolean | undefined;
    const encoding = (args.encoding as BufferEncoding) || 'utf-8';

    if (!filePath) {
        return { success: false, error: 'filePath is required' };
    }
    if (content === undefined || content === null) {
        return { success: false, error: 'content is required' };
    }

    const resolvedPath = resolve(filePath);

    // Security: block writing to critical system paths
    const blockedPrefixes = ['/etc/', '/usr/', '/bin/', '/sbin/', '/System/', '/Library/'];
    if (blockedPrefixes.some(p => resolvedPath.startsWith(p))) {
        return {
            success: false,
            error: `Writing to system path is not allowed: ${resolvedPath}`,
        };
    }

    try {
        await mkdir(dirname(resolvedPath), { recursive: true });

        if (shouldAppend) {
            await appendFile(resolvedPath, content, { encoding });
        } else {
            await writeFile(resolvedPath, content, { encoding });
        }

        return {
            success: true,
            message: shouldAppend ? 'Content appended to file' : 'File written successfully',
            filePath: resolvedPath,
            bytesWritten: Buffer.byteLength(content, encoding),
        };
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to write file',
        };
    }
}

/**
 * Read content from a local file
 */
async function readLocalFile(args: Record<string, unknown>): Promise<unknown> {
    const filePath = args.filePath as string;
    const offset = args.offset as number | undefined;
    const limit = args.limit as number | undefined;
    const encoding = (args.encoding as BufferEncoding) || 'utf-8';

    if (!filePath) {
        return { success: false, error: 'filePath is required' };
    }

    const resolvedPath = resolve(filePath);

    try {
        const content = await readFile(resolvedPath, { encoding });
        const lines = content.split('\n');

        const startLine = offset || 0;
        const endLine = limit ? startLine + limit : lines.length;
        const slicedLines = lines.slice(startLine, endLine);

        return {
            success: true,
            filePath: resolvedPath,
            content: slicedLines.join('\n'),
            totalLines: lines.length,
            linesReturned: slicedLines.length,
            startLine,
            endLine: Math.min(endLine, lines.length),
            truncated: endLine < lines.length,
        };
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return { success: false, error: `File not found: ${resolvedPath}` };
        }
        if (err.code === 'EISDIR') {
            return { success: false, error: `Path is a directory, not a file: ${resolvedPath}` };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to read file',
        };
    }
}

/**
 * List directory contents
 */
async function listDirectory(args: Record<string, unknown>): Promise<unknown> {
    const dirPath = args.dirPath as string | undefined;
    const recursive = args.recursive as boolean | undefined;
    const pattern = args.pattern as string | undefined;

    const resolvedPath = resolve(dirPath || process.cwd());

    try {
        if (recursive) {
            const entries = await listDirectoryRecursive(resolvedPath, 0, 3, pattern);
            return {
                success: true,
                dirPath: resolvedPath,
                entries,
                count: entries.length,
            };
        } else {
            const dirEntries = await readdir(resolvedPath, { withFileTypes: true });
            let entries = dirEntries.map(e => ({
                name: e.name,
                type: e.isDirectory() ? 'directory' : 'file',
                path: join(resolvedPath, e.name),
            }));

            if (pattern) {
                const regex = globToRegex(pattern);
                entries = entries.filter(e => regex.test(e.name));
            }

            const enriched = await Promise.all(
                entries.map(async (e) => {
                    if (e.type === 'file') {
                        try {
                            const s = await stat(e.path);
                            return { ...e, size: s.size };
                        } catch {
                            return e;
                        }
                    }
                    return e;
                })
            );

            return {
                success: true,
                dirPath: resolvedPath,
                entries: enriched,
                count: enriched.length,
            };
        }
    } catch (error) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ENOENT') {
            return { success: false, error: `Directory not found: ${resolvedPath}` };
        }
        if (err.code === 'ENOTDIR') {
            return { success: false, error: `Path is not a directory: ${resolvedPath}` };
        }
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Failed to list directory',
        };
    }
}

/**
 * Recursively list directory up to maxDepth
 */
async function listDirectoryRecursive(
    dirPath: string,
    depth: number,
    maxDepth: number,
    pattern?: string,
): Promise<Array<{ name: string; type: string; path: string; size?: number }>> {
    if (depth > maxDepth) return [];

    const results: Array<{ name: string; type: string; path: string; size?: number }> = [];
    const dirEntries = await readdir(dirPath, { withFileTypes: true });
    const regex = pattern ? globToRegex(pattern) : null;

    for (const entry of dirEntries) {
        // Skip hidden directories and node_modules in recursive mode
        if (entry.name.startsWith('.') && entry.isDirectory()) continue;
        if (entry.name === 'node_modules') continue;

        const fullPath = join(dirPath, entry.name);

        if (entry.isDirectory()) {
            results.push({ name: entry.name, type: 'directory', path: fullPath });
            const children = await listDirectoryRecursive(fullPath, depth + 1, maxDepth, pattern);
            results.push(...children);
        } else {
            if (!regex || regex.test(entry.name)) {
                try {
                    const s = await stat(fullPath);
                    results.push({ name: entry.name, type: 'file', path: fullPath, size: s.size });
                } catch {
                    results.push({ name: entry.name, type: 'file', path: fullPath });
                }
            }
        }
    }

    return results;
}

/**
 * Convert a simple glob pattern to regex
 */
function globToRegex(pattern: string): RegExp {
    const escaped = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`, 'i');
}
