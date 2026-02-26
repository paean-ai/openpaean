/**
 * Articulate (a8e) CLI Executor
 * Integrates with the Articulate CLI for local-first AI-assisted coding tasks
 * https://github.com/a8e-ai/a8e
 */

import { spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import type { ExecutorOptions, ExecutorResult, AvailabilityStatus } from '../types.js';
import type { AgentExecutor } from './index.js';

const exec = promisify(execCallback);

export class ArticulateExecutor implements AgentExecutor {
    readonly type = 'articulate' as const;
    private process: ChildProcess | null = null;
    private binaryPath: string;

    constructor(binaryPath: string = 'a8e') {
        this.binaryPath = binaryPath;
    }

    async isAvailable(): Promise<boolean> {
        try {
            await exec(`which ${this.binaryPath}`);
            return true;
        } catch {
            return false;
        }
    }

    async checkAvailability(): Promise<AvailabilityStatus> {
        try {
            const { stdout: whichOut } = await exec(`which ${this.binaryPath}`);
            const binaryPath = whichOut.trim();

            try {
                const { stdout } = await exec(`${this.binaryPath} info`, { timeout: 10000 });
                const versionMatch = stdout.match(/(?:v(?:ersion)?\s*)?(\d+\.\d+(?:\.\d+)?)/i);

                return {
                    available: true,
                    binaryExists: true,
                    binaryPath,
                    authStatus: 'authenticated',
                    version: versionMatch?.[1],
                };
            } catch {
                return {
                    available: true,
                    binaryExists: true,
                    binaryPath,
                    authStatus: 'unknown',
                    authMessage: 'a8e uses BYOK (Bring Your Own Key) — ensure a provider is configured',
                };
            }
        } catch {
            return {
                available: false,
                binaryExists: false,
                authStatus: 'unknown',
                error: `Binary '${this.binaryPath}' not found in PATH. Install: curl -fsSL https://a8e.ai/install.sh | bash`,
            };
        }
    }

    async execute(prompt: string, options?: ExecutorOptions): Promise<ExecutorResult> {
        const startTime = Date.now();
        const args = this.buildArgs(prompt, options);

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            const timeout = options?.timeout ?? 600000;

            this.process = spawn(this.binaryPath, args, {
                cwd: options?.cwd,
                env: { ...process.env, ...options?.env },
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            const timeoutId = setTimeout(() => {
                if (this.process) {
                    this.process.kill('SIGTERM');
                    resolve({
                        success: false,
                        output: stdout,
                        error: `Execution timed out after ${timeout}ms`,
                        durationMs: Date.now() - startTime,
                    });
                }
            }, timeout);

            this.process.stdout?.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                options?.onOutput?.(text, 'stdout');
            });

            this.process.stderr?.on('data', (data) => {
                const text = data.toString();
                stderr += text;
                options?.onOutput?.(text, 'stderr');
            });

            this.process.on('close', (code) => {
                clearTimeout(timeoutId);
                this.process = null;

                let structured: Record<string, unknown> | undefined;
                try {
                    if (stdout.trim().startsWith('{')) {
                        structured = JSON.parse(stdout);
                    }
                } catch {
                    // Not JSON
                }

                resolve({
                    success: code === 0,
                    output: stdout,
                    error: code !== 0 ? stderr || `Exit code: ${code}` : undefined,
                    exitCode: code ?? undefined,
                    durationMs: Date.now() - startTime,
                    structured,
                });
            });

            this.process.on('error', (err) => {
                clearTimeout(timeoutId);
                this.process = null;

                resolve({
                    success: false,
                    output: stdout,
                    error: err.message,
                    durationMs: Date.now() - startTime,
                });
            });
        });
    }

    private buildArgs(prompt: string, options?: ExecutorOptions): string[] {
        const args: string[] = ['run'];
        args.push('--text', prompt);
        if (options?.captureOutput) {
            args.push('--output-format', 'json');
        }
        if (options?.skipPermissions) {
            args.push('--no-session');
        }
        if (options?.args) {
            args.push(...options.args);
        }
        return args;
    }

    abort(): void {
        if (this.process) {
            this.process.kill('SIGTERM');
            this.process = null;
        }
    }
}
