/**
 * Claude Code CLI Executor
 * Integrates with Claude Code CLI for complex refactoring and code understanding
 */

import { spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import type { ExecutorOptions, ExecutorResult } from '../types.js';
import type { AgentExecutor } from './index.js';

const exec = promisify(execCallback);

export class ClaudeExecutor implements AgentExecutor {
    readonly type = 'claude' as const;
    private process: ChildProcess | null = null;
    private binaryPath: string;

    constructor(binaryPath: string = 'claude') {
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

    async execute(prompt: string, options?: ExecutorOptions): Promise<ExecutorResult> {
        const startTime = Date.now();
        const args = this.buildArgs(prompt, options);

        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            const timeout = options?.timeout ?? 900000;

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

                resolve({
                    success: code === 0,
                    output: stdout,
                    error: code !== 0 ? stderr || `Exit code: ${code}` : undefined,
                    exitCode: code ?? undefined,
                    durationMs: Date.now() - startTime,
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
        const args: string[] = [];
        args.push('-p', prompt);
        if (options?.skipPermissions) {
            args.push('--dangerously-skip-permissions');
        } else {
            args.push('--permission-mode', 'acceptEdits');
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
