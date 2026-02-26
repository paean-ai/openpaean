/**
 * Worker Service
 * Core service for the OpenPaean Local Autonomous Worker.
 * Manages task polling, execution, and lifecycle.
 */

import { EventEmitter } from 'events';
import { agentService } from '../agent/service.js';
import type { McpToolResult, AgentStreamCallbacks } from '../agent/types.js';
import {
    updateTodoItem,
    completeTodoItem,
} from '../api/todo.js';
import {
    pollWorkerTasks,
    claimTask,
    releaseTask,
    sendHeartbeat,
    reportProgress,
    completeWorkerTask,
    checkConfirmation,
    type WorkerTask,
    type WorkerStatus as ApiWorkerStatus,
} from '../api/worker-api.js';
import { executeSystemTool } from '../mcp/system.js';
import {
    type WorkerConfig,
    type WorkerState,
    type TaskContext,
    type TaskResult,
    type WorkerEvent,
    type WorkerEventHandler,
    DEFAULT_WORKER_CONFIG,
    buildTaskPrompt,
} from './types.js';
import { getConfig } from '../utils/config.js';
import os from 'os';

export class WorkerService extends EventEmitter {
    private config: WorkerConfig;
    private state: WorkerState;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private abortController: AbortController | null = null;
    private mcpState: unknown = null;
    private onMcpToolCall: unknown = null;
    private mcpClient: unknown = null;

    private sessionId?: string;
    private deviceName: string;
    private capabilities: string[];

    private externalMcp = false;
    private idleCheckFn?: () => boolean;

    constructor(config: Partial<WorkerConfig> = {}) {
        super();
        this.config = { ...DEFAULT_WORKER_CONFIG, ...config };
        this.state = {
            status: 'idle',
            completedCount: 0,
            failedCount: 0,
        };
        this.deviceName = `OpenPaean Worker @ ${os.hostname()}`;
        this.capabilities = ['analyze_project', 'run_script', 'git_status', 'system_info'];
    }

    setMcpState(mcpState: unknown, onMcpToolCall: unknown, mcpClient: unknown): void {
        this.mcpState = mcpState;
        this.onMcpToolCall = onMcpToolCall;
        this.mcpClient = mcpClient;
        this.externalMcp = true;
    }

    setIdleCheck(fn: () => boolean): void {
        this.idleCheckFn = fn;
    }

    setSessionId(sessionId: string): void {
        this.sessionId = sessionId;
    }

    getSessionId(): string | undefined {
        return this.sessionId;
    }

    async start(): Promise<void> {
        if (this.state.status === 'running') {
            throw new Error('Worker is already running');
        }

        this.log('Starting worker...');

        if (!this.sessionId) {
            const config = getConfig();
            this.sessionId = config.deviceSessionId;

            if (!this.sessionId && config.token) {
                const crypto = await import('crypto');
                const hash = crypto.createHash('sha256')
                    .update(`${os.hostname()}-${config.token.slice(0, 32)}`)
                    .digest('hex')
                    .slice(0, 32);
                this.sessionId = `openpaean-worker-${hash}`;
                this.log(`Generated session ID: ${this.sessionId}`);
            }
        }

        if (!this.sessionId) {
            throw new Error('Session ID required. Please login first.');
        }

        this.state = {
            ...this.state,
            status: 'running',
            startedAt: new Date(),
            lastError: undefined,
        };

        this.abortController = new AbortController();
        this.emit('event', { type: 'started' } as WorkerEvent);

        this.startHeartbeat();

        this.pollAndExecute();
        this.pollTimer = setInterval(() => {
            if (this.state.status === 'running' && !this.state.currentTask) {
                this.pollAndExecute();
            }
        }, this.config.pollInterval);

        this.log('Worker started');
    }

    private startHeartbeat(): void {
        this.sendHeartbeatUpdate();
        this.heartbeatTimer = setInterval(() => {
            this.sendHeartbeatUpdate();
        }, 30000);
    }

    private async sendHeartbeatUpdate(): Promise<void> {
        if (!this.sessionId) return;
        try {
            const status: ApiWorkerStatus = this.state.status === 'running'
                ? (this.state.currentTask ? 'running' : 'idle')
                : this.state.status === 'paused' ? 'paused' : 'idle';

            await sendHeartbeat(this.sessionId, {
                status,
                currentTaskId: this.state.currentTask?.task.id,
                completedCount: this.state.completedCount,
                failedCount: this.state.failedCount,
                workingDirectory: this.config.workingDirectory || process.cwd(),
                capabilities: this.capabilities,
            });
        } catch (error) {
            this.log(`Heartbeat error: ${error}`);
        }
    }

    async stop(): Promise<void> {
        if (this.state.status === 'idle') return;

        this.log('Stopping worker...');
        this.state.status = 'stopping';

        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }

        if (!this.externalMcp && this.mcpClient && typeof (this.mcpClient as { disconnectAll?: () => Promise<void> }).disconnectAll === 'function') {
            try {
                await (this.mcpClient as { disconnectAll: () => Promise<void> }).disconnectAll();
            } catch {
                // Ignore disconnect errors
            }
        }

        if (this.state.currentTask && this.sessionId) {
            try {
                await releaseTask(this.state.currentTask.task.id, this.sessionId, 'Worker stopped');
            } catch (e) {
                this.log(`Failed to release task: ${e}`);
            }
        }

        if (this.sessionId) {
            await sendHeartbeat(this.sessionId, {
                status: 'idle',
                completedCount: this.state.completedCount,
                failedCount: this.state.failedCount,
            });
        }

        this.state = { ...this.state, status: 'idle', currentTask: undefined };
        this.emit('event', { type: 'stopped' } as WorkerEvent);
        this.log('Worker stopped');
    }

    pause(): void {
        if (this.state.status === 'running') {
            this.state.status = 'paused';
            this.emit('event', { type: 'paused' } as WorkerEvent);
        }
    }

    resume(): void {
        if (this.state.status === 'paused') {
            this.state.status = 'running';
            this.emit('event', { type: 'resumed' } as WorkerEvent);
        }
    }

    getState(): WorkerState {
        return { ...this.state };
    }

    onEvent(handler: WorkerEventHandler): void {
        this.on('event', handler);
    }

    private async pollAndExecute(): Promise<void> {
        if (this.state.status !== 'running') return;

        if (this.idleCheckFn && !this.idleCheckFn()) {
            this.log('Host is busy, deferring task poll');
            return;
        }

        this.state.lastPollAt = new Date();

        try {
            const task = await this.fetchNextTask();
            if (!task) {
                this.emit('event', { type: 'poll_empty' } as WorkerEvent);
                return;
            }

            this.emit('event', { type: 'task_claimed', task } as WorkerEvent);

            let attempt = 1;
            let previousFailureSummary: string | undefined;
            const maxRetries = this.config.maxRetries;

            while (attempt <= maxRetries) {
                const ctx: TaskContext = {
                    task,
                    attempt,
                    previousFailureSummary,
                    startedAt: new Date(),
                };

                this.state.currentTask = ctx;
                this.emit('event', { type: 'task_started', task, attempt } as WorkerEvent);

                const result = await this.executeTask(ctx);

                if (result.success) {
                    if (this.config.verificationEnabled) {
                        const verified = await this.verifyTask(ctx);
                        if (!verified) {
                            this.emit('event', { type: 'task_verification_failed', task } as WorkerEvent);
                            previousFailureSummary = 'Verification failed after execution.';
                            attempt++;
                            continue;
                        }
                    }

                    try {
                        await completeTodoItem(task.id, result.message);
                        await this.reportTaskCompletion(ctx, true, result.message || '', result.durationMs || 0);
                    } catch (e) {
                        this.log(`Failed to mark task as complete: ${e}`);
                    }

                    this.state.completedCount++;
                    this.emit('event', {
                        type: 'task_completed',
                        task,
                        duration: Date.now() - ctx.startedAt.getTime()
                    } as WorkerEvent);
                    break;
                } else {
                    previousFailureSummary = result.error || 'Unknown error';
                    const isUnrecoverable = this.isUnrecoverableError(previousFailureSummary);
                    const willRetry = !isUnrecoverable && attempt < maxRetries;

                    this.emit('event', {
                        type: 'task_failed',
                        task,
                        error: previousFailureSummary,
                        willRetry,
                    } as WorkerEvent);

                    if (willRetry) {
                        try {
                            await updateTodoItem(task.id, {
                                metadata: {
                                    ...task.metadata,
                                    lastFailureSummary: previousFailureSummary,
                                    retryCount: attempt,
                                    lastAttemptAt: new Date().toISOString(),
                                },
                            });
                        } catch (e) {
                            this.log(`Failed to update task metadata: ${e}`);
                        }
                        attempt++;
                        const backoffMs = this.getBackoffDelay(attempt);
                        this.log(`Retrying in ${backoffMs / 1000}s (attempt ${attempt}/${maxRetries})...`);
                        await this.sleep(backoffMs);
                    } else {
                        this.state.failedCount++;
                        try {
                            await updateTodoItem(task.id, {
                                status: 'cancelled',
                                metadata: {
                                    ...task.metadata,
                                    lastFailure: previousFailureSummary,
                                    failedAt: new Date().toISOString(),
                                    retriesExhausted: true,
                                },
                            });
                        } catch (e) {
                            this.log(`Failed to mark task as cancelled: ${e}`);
                        }
                        await this.reportTaskCompletion(ctx, false, previousFailureSummary, Date.now() - ctx.startedAt.getTime());
                        break;
                    }
                }
            }

            this.state.currentTask = undefined;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            this.state.lastError = errorMsg;
            this.emit('event', { type: 'error', error: errorMsg } as WorkerEvent);
            this.log(`Error in poll cycle: ${errorMsg}. Cooling down...`);
            await this.sleep(this.config.cooldownOnError);
        }
    }

    private async fetchNextTask(): Promise<WorkerTask | null> {
        if (!this.sessionId) return null;

        try {
            const { tasks } = await pollWorkerTasks({
                sessionId: this.sessionId,
                taskTypes: ['remote-agent'],
                limit: 5,
            });

            if (tasks.length === 0) return null;

            for (const task of tasks) {
                const claimResult = await claimTask(task.id, this.sessionId, this.deviceName);
                if (claimResult.success && claimResult.task) {
                    this.log(`Claimed task: ${claimResult.task.id}`);
                    return claimResult.task;
                }
                this.log(`Failed to claim task ${task.id}: ${claimResult.error}`);
            }
            return null;
        } catch (error) {
            this.log(`Failed to fetch tasks: ${error}`);
            return null;
        }
    }

    private async executeTask(ctx: TaskContext): Promise<TaskResult> {
        const startTime = Date.now();
        const prompt = buildTaskPrompt(ctx);
        const taskId = ctx.task.id;

        if (this.sessionId) {
            await reportProgress(taskId, this.sessionId, {
                stage: 'started',
                message: `Agent started processing: ${ctx.task.content.slice(0, 100)}`,
            }).catch(() => {});
        }

        return new Promise((resolve) => {
            let responseText = '';
            let hasError = false;
            let errorMessage = '';
            let toolCallCount = 0;

            const timeout = setTimeout(() => {
                agentService.abort();
                this.emit('event', { type: 'worker_done', taskId, success: false, output: 'Task timed out' } as WorkerEvent);
                resolve({
                    success: false,
                    error: `Task timed out after ${this.config.taskTimeout}ms`,
                    durationMs: Date.now() - startTime,
                });
            }, this.config.taskTimeout);

            const callbacks: AgentStreamCallbacks = {
                onContent: (text: string, partial: boolean) => {
                    if (partial) {
                        responseText += text;
                    } else {
                        responseText = text;
                    }
                    this.emit('event', { type: 'worker_content', text, partial } as WorkerEvent);
                },

                onToolCall: (id: string, name: string) => {
                    this.emit('event', { type: 'worker_tool_call', id, name, isMcp: false } as WorkerEvent);
                },

                onToolResult: (id: string, name: string, result: unknown) => {
                    const isError = result && typeof result === 'object' &&
                        (result as Record<string, unknown>).isError === true;
                    this.emit('event', { type: 'worker_tool_result', id, name, status: isError ? 'error' : 'completed' } as WorkerEvent);
                },

                onMcpToolCall: async (
                    callId: string,
                    serverName: string,
                    toolName: string,
                    args: Record<string, unknown>
                ): Promise<McpToolResult> => {
                    toolCallCount++;
                    this.emit('event', { type: 'worker_tool_call', id: callId, name: toolName, isMcp: true, serverName } as WorkerEvent);

                    if (this.sessionId && toolCallCount % 3 === 1) {
                        reportProgress(taskId, this.sessionId, {
                            stage: 'executing',
                            message: `Using tool: ${toolName}`,
                        }).catch(() => {});
                    }

                    if (typeof this.onMcpToolCall === 'function') {
                        try {
                            const result = await (this.onMcpToolCall as (
                                callId: string,
                                serverName: string,
                                toolName: string,
                                args: Record<string, unknown>
                            ) => Promise<McpToolResult>)(callId, serverName, toolName, args);
                            this.emit('event', { type: 'worker_tool_result', id: callId, name: toolName, status: result.isError ? 'error' : 'completed' } as WorkerEvent);
                            return result;
                        } catch (error) {
                            this.emit('event', { type: 'worker_tool_result', id: callId, name: toolName, status: 'error' } as WorkerEvent);
                            return {
                                content: [{ type: 'text' as const, text: `Error: ${error}` }],
                                isError: true,
                            };
                        }
                    }

                    if (toolName.startsWith('paean_execute') || toolName.startsWith('paean_check') || toolName.startsWith('paean_kill')) {
                        const result = await executeSystemTool(toolName, args, {
                            autonomousMode: this.config.autonomousMode,
                            debug: this.config.debug,
                        }) as { success: boolean; [key: string]: unknown };
                        this.emit('event', { type: 'worker_tool_result', id: callId, name: toolName, status: result.success ? 'completed' : 'error' } as WorkerEvent);
                        return {
                            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
                            isError: !result.success,
                        };
                    }

                    this.emit('event', { type: 'worker_tool_result', id: callId, name: toolName, status: 'error' } as WorkerEvent);
                    return {
                        content: [{ type: 'text' as const, text: 'MCP not available' }],
                        isError: true,
                    };
                },

                onError: (error: string) => {
                    hasError = true;
                    errorMessage = error;
                },

                onDone: async (convId?: string) => {
                    clearTimeout(timeout);
                    if (ctx.conversationId === undefined) {
                        ctx.conversationId = convId;
                    }

                    const durationMs = Date.now() - startTime;

                    if (hasError) {
                        this.emit('event', { type: 'worker_done', taskId, success: false, output: errorMessage } as WorkerEvent);
                        resolve({ success: false, error: errorMessage, durationMs });
                    } else {
                        this.emit('event', { type: 'worker_done', taskId, success: true, output: responseText.slice(0, 500) } as WorkerEvent);
                        if (this.sessionId) {
                            await reportProgress(taskId, this.sessionId, {
                                stage: 'verifying',
                                message: 'Agent completed, verifying results...',
                            }).catch(() => {});
                        }
                        resolve({ success: true, message: responseText.slice(0, 500), durationMs });
                    }
                },
            };

            agentService.streamMessage(prompt, callbacks, {
                conversationId: ctx.conversationId,
                mcpState: this.mcpState as import('../agent/types.js').McpState | undefined,
            });
        });
    }

    private async reportTaskCompletion(
        ctx: TaskContext,
        success: boolean,
        output: string,
        durationMs: number
    ): Promise<void> {
        if (!this.sessionId) return;
        try {
            await completeWorkerTask(ctx.task.id, this.sessionId, {
                success,
                output: output.slice(0, 2000),
                durationMs,
            });
        } catch (error) {
            this.log(`Failed to report task completion: ${error}`);
        }
    }

    private async verifyTask(ctx: TaskContext): Promise<boolean> {
        const verifyCmd = ctx.task.metadata?.verificationCommand as string | undefined;
        if (!verifyCmd) return true;

        try {
            const result = await executeSystemTool('paean_execute_shell', {
                command: verifyCmd,
                timeout: 60000,
            }, { autonomousMode: true }) as { success: boolean };
            return result.success;
        } catch {
            return false;
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                cleanup();
                resolve();
            }, ms);
            const onAbort = () => {
                clearTimeout(timer);
                cleanup();
                resolve();
            };
            const cleanup = () => {
                this.abortController?.signal.removeEventListener('abort', onAbort);
            };
            this.abortController?.signal.addEventListener('abort', onAbort);
        });
    }

    private log(message: string): void {
        if (this.config.debug) {
            console.error(`[Worker] ${message}`);
        }
    }

    private isUnrecoverableError(error: string): boolean {
        const patterns = [
            "reached my limit",
            "session error",
            "start a new conversation",
            "rate limit exceeded",
            "authentication failed",
            "invalid api key",
            "billing limit",
            "context length exceeded",
            "token limit",
            "quota exceeded",
        ];
        const lowerError = error.toLowerCase();
        return patterns.some(p => lowerError.includes(p));
    }

    private getBackoffDelay(attempt: number): number {
        const baseDelay = 5000;
        const maxDelay = 60000;
        return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    }

    public async requestConfirmation(
        taskId: string,
        message: string,
        timeoutMs: number = 5 * 60 * 1000
    ): Promise<boolean> {
        if (!this.sessionId) return false;

        try {
            const result = await reportProgress(taskId, this.sessionId, {
                stage: 'waiting_confirmation',
                message: `CONFIRMATION REQUIRED: ${message}`,
            });

            if (!result.success || !result.subtaskId) return false;

            const subtaskId = result.subtaskId;
            const pollInterval = 5000;
            const startTime = Date.now();

            while (Date.now() - startTime < timeoutMs) {
                if (this.abortController?.signal.aborted) return false;
                try {
                    const check = await checkConfirmation(taskId, subtaskId);
                    if (check.approved) return true;
                } catch {
                    // Continue polling
                }
                await this.sleep(pollInterval);
            }
            return false;
        } catch {
            return false;
        }
    }
}

let workerInstance: WorkerService | null = null;

export function getWorker(config?: Partial<WorkerConfig>): WorkerService {
    if (!workerInstance) {
        workerInstance = new WorkerService(config);
    }
    return workerInstance;
}

export function resetWorker(): void {
    if (workerInstance) {
        workerInstance.stop().catch(() => {});
        workerInstance = null;
    }
}
