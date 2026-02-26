/**
 * Worker Types
 * Type definitions for the OpenPaean Local Autonomous Worker
 */

import os from 'os';
import type { TodoItem } from '../api/todo.js';

export interface WorkerConfig {
    pollInterval: number;
    maxRetries: number;
    taskTimeout: number;
    cooldownOnError: number;
    verificationEnabled: boolean;
    workingDirectory?: string;
    debug?: boolean;
    autonomousMode?: boolean;
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
    pollInterval: 30000,
    maxRetries: 3,
    taskTimeout: 600000,
    cooldownOnError: 60000,
    verificationEnabled: true,
    autonomousMode: true,
};

export interface TaskContext {
    task: TodoItem;
    attempt: number;
    previousFailureSummary?: string;
    startedAt: Date;
    conversationId?: string;
}

export type WorkerStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'error';

export interface WorkerState {
    status: WorkerStatus;
    currentTask?: TaskContext;
    completedCount: number;
    failedCount: number;
    startedAt?: Date;
    lastError?: string;
    lastPollAt?: Date;
}

export interface TaskResult {
    success: boolean;
    message?: string;
    verificationPassed?: boolean;
    error?: string;
    durationMs?: number;
}

export type WorkerEvent =
    | { type: 'started' }
    | { type: 'stopped' }
    | { type: 'paused' }
    | { type: 'resumed' }
    | { type: 'task_claimed'; task: TodoItem }
    | { type: 'task_started'; task: TodoItem; attempt: number }
    | { type: 'task_completed'; task: TodoItem; duration: number }
    | { type: 'task_failed'; task: TodoItem; error: string; willRetry: boolean }
    | { type: 'task_verification_failed'; task: TodoItem }
    | { type: 'poll_empty' }
    | { type: 'error'; error: string }
    | { type: 'worker_content'; text: string; partial: boolean }
    | { type: 'worker_tool_call'; id: string; name: string; isMcp: boolean; serverName?: string }
    | { type: 'worker_tool_result'; id: string; name: string; status: 'completed' | 'error' }
    | { type: 'worker_done'; taskId: string; success: boolean; output?: string };

export type WorkerEventHandler = (event: WorkerEvent) => void;

// ============================================
// Executor Framework Types
// ============================================

export type ExecutorType =
    | 'internal'
    | 'claude'
    | 'gemini'
    | 'cursor'
    | 'codex'
    | 'opencode'
    | 'articulate'
    | 'shell';

export interface ExecutorConfig {
    type: ExecutorType;
    enabled: boolean;
    path?: string;
    defaultArgs?: string[];
    timeout?: number;
}

export type AvailabilityAuthStatus = 'authenticated' | 'unauthenticated' | 'expired' | 'unknown';

export interface AvailabilityStatus {
    available: boolean;
    binaryExists: boolean;
    binaryPath?: string;
    authStatus: AvailabilityAuthStatus;
    authMessage?: string;
    version?: string;
    error?: string;
}

export interface ExecutorOptions {
    cwd?: string;
    timeout?: number;
    args?: string[];
    env?: Record<string, string>;
    skipPermissions?: boolean;
    captureOutput?: boolean;
    onOutput?: (text: string, stream: 'stdout' | 'stderr') => void;
    onProgress?: (message: string) => void;
}

export interface ExecutorResult {
    success: boolean;
    output: string;
    error?: string;
    exitCode?: number;
    durationMs: number;
    structured?: Record<string, unknown>;
}

export const DEFAULT_EXECUTOR_CONFIG: Partial<Record<ExecutorType, ExecutorConfig>> = {
    internal: { type: 'internal', enabled: true },
    claude: { type: 'claude', enabled: true, timeout: 900000 },
    gemini: { type: 'gemini', enabled: true, timeout: 600000 },
    cursor: { type: 'cursor', enabled: true, timeout: 600000 },
    codex: { type: 'codex', enabled: true, timeout: 600000 },
    opencode: { type: 'opencode', enabled: true, timeout: 600000 },
    articulate: { type: 'articulate', enabled: true, timeout: 600000 },
};

export function buildTaskPrompt(ctx: TaskContext): string {
    const task = ctx.task as { cliPayload?: { hint?: string; workingDirectory?: string; context?: Record<string, unknown> } };
    const cliPayload = task.cliPayload;
    const workingDir = cliPayload?.workingDirectory || process.cwd();

    const basePrompt = `You are an autonomous AI assistant running on the user's local machine.
You have access to both local tools (filesystem, terminal, git) and cloud tools (notes, todos, search).

## Task
ID: ${ctx.task.id}
Content: ${ctx.task.content}
Priority: ${ctx.task.priority}
${ctx.task.description ? `\nDetails: ${ctx.task.description}` : ''}
${ctx.task.tags?.length ? `\nTags: ${ctx.task.tags.join(', ')}` : ''}
${cliPayload?.hint ? `\nHint: ${cliPayload.hint}` : ''}

## Your Environment
- Working Directory: ${workingDir}
- Device: ${process.env.HOSTNAME || os.hostname()}
- Platform: ${process.platform}
${cliPayload?.context ? `\nAdditional Context: ${JSON.stringify(cliPayload.context)}` : ''}

## Instructions
1. Analyze what needs to be done
2. Use available tools to complete the task autonomously
3. Verify your work is correct
4. Call paean_complete_task when finished

## Available Tool Categories
- **Local MCP**: File read/write, shell commands, git operations
- **Cloud MCP**: Notes, todos, search, transcriptions

## Important
- You have full autonomy to decide HOW to complete the task
- Use your best judgment on which tools to use
- If you encounter errors, try alternative approaches
- Ask for confirmation only for potentially destructive operations
`;

    if (ctx.attempt > 1 && ctx.previousFailureSummary) {
        return `${basePrompt}
## Previous Attempt Failed (Attempt ${ctx.attempt}/3)
${ctx.previousFailureSummary}

Please review the previous failure and try a different approach.
`;
    }

    return basePrompt;
}
