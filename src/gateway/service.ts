/**
 * Gateway Service
 *
 * Runs the OpenPaean CLI as a gateway node that polls for remote messages
 * from web/mobile clients, processes them locally with full MCP tool access,
 * and relays streaming events back through the server.
 */

import { EventEmitter } from 'events';
import os from 'os';
import { agentService } from '../agent/service.js';
import type { McpToolResult, AgentStreamCallbacks, McpState } from '../agent/types.js';
import { executeSystemTool } from '../mcp/system.js';
import { sendHeartbeat, type WorkerStatus as ApiWorkerStatus } from '../api/worker-api.js';
import {
    pollGatewayRequests,
    claimGatewayRequest,
    pushGatewayEvents,
    completeGatewayRequest,
    type GatewayRequest,
    type GatewayStreamEvent,
} from '../api/gateway-api.js';
import { getConfig } from '../utils/config.js';

export interface GatewayConfig {
    pollInterval: number;
    eventBatchInterval: number;
    requestTimeout: number;
    debug?: boolean;
}

const DEFAULT_CONFIG: GatewayConfig = {
    pollInterval: 3000,
    eventBatchInterval: 500,
    requestTimeout: 600000,
    debug: false,
};

export type GatewayStatus = 'idle' | 'running' | 'stopping';

export interface GatewayState {
    status: GatewayStatus;
    currentRequest?: GatewayRequest;
    completedCount: number;
    failedCount: number;
    startedAt?: Date;
    lastPollAt?: Date;
}

export type GatewayEvent =
    | { type: 'started' }
    | { type: 'stopped' }
    | { type: 'request_claimed'; request: GatewayRequest }
    | { type: 'request_completed'; request: GatewayRequest; durationMs: number }
    | { type: 'request_failed'; request: GatewayRequest; error: string }
    | { type: 'poll_empty' }
    | { type: 'error'; error: string }
    | { type: 'remote_content'; text: string; partial: boolean }
    | { type: 'remote_tool_call'; id: string; name: string; serverName?: string; isMcp: boolean }
    | { type: 'remote_tool_result'; id: string; name: string; status: 'completed' | 'error' }
    | { type: 'remote_done'; conversationId?: string }
    | { type: 'remote_error'; error: string };

export class GatewayService extends EventEmitter {
    private config: GatewayConfig;
    private state: GatewayState;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
    private abortController: AbortController | null = null;

    private mcpState: unknown = null;
    private onMcpToolCall: unknown = null;
    private mcpClient: unknown = null;

    private sessionId?: string;
    private deviceName: string;

    constructor(config: Partial<GatewayConfig> = {}) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.state = {
            status: 'idle',
            completedCount: 0,
            failedCount: 0,
        };
        this.deviceName = `OpenPaean Gateway @ ${os.hostname()}`;
    }

    getState(): GatewayState {
        return { ...this.state };
    }

    isProcessingRemote(): boolean {
        return !!this.state.currentRequest;
    }

    setMcpState(mcpState: unknown, onMcpToolCall: unknown, mcpClient: unknown): void {
        this.mcpState = mcpState;
        this.onMcpToolCall = onMcpToolCall;
        this.mcpClient = mcpClient;
    }

    async start(): Promise<void> {
        if (this.state.status === 'running') {
            throw new Error('Gateway is already running');
        }

        this.log('Starting gateway...');

        if (!this.sessionId) {
            const config = getConfig();
            this.sessionId = config.deviceSessionId;

            if (!this.sessionId && config.token) {
                const crypto = await import('crypto');
                const hash = crypto.createHash('sha256')
                    .update(`${os.hostname()}-${config.token.slice(0, 32)}`)
                    .digest('hex')
                    .slice(0, 32);
                this.sessionId = `openpaean-gw-${hash}`;
            }
        }

        if (!this.sessionId) {
            throw new Error('Session ID required. Please login first.');
        }

        this.state = {
            ...this.state,
            status: 'running',
            startedAt: new Date(),
        };

        this.abortController = new AbortController();
        this.emit('event', { type: 'started' } as GatewayEvent);

        this.startHeartbeat();
        this.startPolling();

        this.log('Gateway started');
    }

    async stop(): Promise<void> {
        if (this.state.status === 'idle') return;

        this.log('Stopping gateway...');
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

        if (this.mcpClient && typeof (this.mcpClient as { disconnectAll?: () => Promise<void> }).disconnectAll === 'function') {
            try {
                await (this.mcpClient as { disconnectAll: () => Promise<void> }).disconnectAll();
            } catch { /* ignore */ }
        }

        if (this.sessionId) {
            await sendHeartbeat(this.sessionId, {
                status: 'idle',
                completedCount: this.state.completedCount,
                failedCount: this.state.failedCount,
            }).catch(() => {});
        }

        this.state = { ...this.state, status: 'idle', currentRequest: undefined };
        this.emit('event', { type: 'stopped' } as GatewayEvent);
        this.log('Gateway stopped');
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
            const status: ApiWorkerStatus = this.state.currentRequest ? 'running' : 'idle';
            const result = await sendHeartbeat(this.sessionId, {
                status,
                completedCount: this.state.completedCount,
                failedCount: this.state.failedCount,
                workingDirectory: process.cwd(),
                capabilities: ['gateway', 'mcp'],
            });
            if (!result.success) {
                this.emit('event', { type: 'error', error: `Heartbeat failed: ${result.error}` } as GatewayEvent);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.emit('event', { type: 'error', error: `Heartbeat failed: ${msg}` } as GatewayEvent);
        }
    }

    private startPolling(): void {
        this.pollAndProcess();
        this.pollTimer = setInterval(() => {
            if (this.state.status === 'running' && !this.state.currentRequest) {
                this.pollAndProcess();
            }
        }, this.config.pollInterval);
    }

    private async pollAndProcess(): Promise<void> {
        if (this.state.status !== 'running' || !this.sessionId) return;

        this.state.lastPollAt = new Date();

        try {
            const { requests } = await pollGatewayRequests(this.sessionId);

            if (requests.length === 0) {
                this.emit('event', { type: 'poll_empty' } as GatewayEvent);
                return;
            }

            for (const req of requests) {
                const claimResult = await claimGatewayRequest(req.requestId, this.sessionId, this.deviceName);
                if (claimResult.success && claimResult.request) {
                    this.log(`Claimed request: ${claimResult.request.requestId}`);
                    this.emit('event', { type: 'request_claimed', request: claimResult.request } as GatewayEvent);
                    await this.processRequest(claimResult.request);
                    return;
                }
                this.log(`Failed to claim ${req.requestId}: ${claimResult.error}`);
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            this.emit('event', { type: 'error', error: msg } as GatewayEvent);
        }
    }

    private async processRequest(request: GatewayRequest): Promise<void> {
        this.state.currentRequest = request;
        const startTime = Date.now();

        let eventBuffer: GatewayStreamEvent[] = [];
        let batchTimer: ReturnType<typeof setInterval> | null = null;

        const flushEvents = async () => {
            if (eventBuffer.length === 0 || !this.sessionId) return;
            const batch = [...eventBuffer];
            eventBuffer = [];
            await pushGatewayEvents(request.requestId, this.sessionId, batch).catch((err) => {
                this.log(`Event push failed: ${err instanceof Error ? err.message : err}`);
            });
        };

        batchTimer = setInterval(() => { flushEvents(); }, this.config.eventBatchInterval);

        return new Promise<void>((resolve) => {
            let responseText = '';
            let hasError = false;
            let errorMessage = '';
            const toolCalls: unknown[] = [];

            const timeout = setTimeout(async () => {
                agentService.abort();
                await this.finishRequest(request, false, '', 'Request timed out', startTime, batchTimer, flushEvents);
                resolve();
            }, this.config.requestTimeout);

            const callbacks: AgentStreamCallbacks = {
                onContent: (text: string, partial: boolean) => {
                    if (partial) {
                        responseText += text;
                    } else {
                        responseText = text;
                    }
                    eventBuffer.push({ type: 'content', data: { text, partial } });
                    this.emit('event', { type: 'remote_content', text, partial } as GatewayEvent);
                },

                onToolCall: (id: string, name: string) => {
                    toolCalls.push({ id, name, status: 'pending' });
                    eventBuffer.push({ type: 'tool_call', data: { id, name, status: 'pending' } });
                    this.emit('event', { type: 'remote_tool_call', id, name, isMcp: false } as GatewayEvent);
                },

                onToolResult: (id: string, name: string, result?: unknown) => {
                    const tc = toolCalls.find((t: unknown) => (t as Record<string, unknown>).id === id) as Record<string, unknown> | undefined;
                    if (tc) tc.status = 'completed';
                    const isError = result && typeof result === 'object' &&
                        (result as Record<string, unknown>).isError === true;
                    eventBuffer.push({ type: 'tool_result', data: { id, name, status: 'completed', result } });
                    this.emit('event', { type: 'remote_tool_result', id, name, status: isError ? 'error' : 'completed' } as GatewayEvent);
                },

                onMcpToolCall: async (
                    callId: string,
                    serverName: string,
                    toolName: string,
                    args: Record<string, unknown>
                ): Promise<McpToolResult> => {
                    eventBuffer.push({ type: 'mcp_tool_call', data: { callId, serverName, toolName } });
                    this.emit('event', { type: 'remote_tool_call', id: callId, name: toolName, serverName, isMcp: true } as GatewayEvent);

                    let mcpResult: McpToolResult;

                    if (typeof this.onMcpToolCall === 'function') {
                        try {
                            mcpResult = await (this.onMcpToolCall as (
                                callId: string,
                                serverName: string,
                                toolName: string,
                                args: Record<string, unknown>
                            ) => Promise<McpToolResult>)(callId, serverName, toolName, args);
                        } catch (error) {
                            mcpResult = {
                                content: [{ type: 'text' as const, text: `Error: ${error instanceof Error ? error.message : error}` }],
                                isError: true,
                            };
                        }
                    } else if (toolName.startsWith('paean_execute') || toolName.startsWith('paean_check') || toolName.startsWith('paean_kill')) {
                        const result = await executeSystemTool(toolName, args, {
                            autonomousMode: true,
                            debug: this.config.debug,
                        }) as { success: boolean; [key: string]: unknown };
                        mcpResult = {
                            content: [{ type: 'text' as const, text: JSON.stringify(result) }],
                            isError: !result.success,
                        };
                    } else {
                        mcpResult = {
                            content: [{ type: 'text' as const, text: 'MCP not available' }],
                            isError: true,
                        };
                    }

                    this.emit('event', { type: 'remote_tool_result', id: callId, name: toolName, status: mcpResult.isError ? 'error' : 'completed' } as GatewayEvent);
                    return mcpResult;
                },

                onError: (error: string) => {
                    hasError = true;
                    errorMessage = error;
                    eventBuffer.push({ type: 'error', data: { error } });
                    this.emit('event', { type: 'remote_error', error } as GatewayEvent);
                },

                onDone: async (convId?: string) => {
                    clearTimeout(timeout);
                    eventBuffer.push({ type: 'done', data: { conversationId: convId } });
                    this.emit('event', { type: 'remote_done', conversationId: convId } as GatewayEvent);

                    if (hasError) {
                        await this.finishRequest(request, false, responseText, errorMessage, startTime, batchTimer, flushEvents);
                    } else {
                        await this.finishRequest(request, true, responseText, undefined, startTime, batchTimer, flushEvents, toolCalls);
                    }
                    resolve();
                },
            };

            agentService.streamMessage(request.message, callbacks, {
                conversationId: request.conversationHashKey,
                mcpState: this.mcpState as McpState | undefined,
            });
        });
    }

    private async finishRequest(
        request: GatewayRequest,
        success: boolean,
        content: string,
        error: string | undefined,
        startTime: number,
        batchTimer: ReturnType<typeof setInterval> | null,
        flushEvents: () => Promise<void>,
        toolCalls?: unknown[]
    ): Promise<void> {
        await flushEvents();
        if (batchTimer) clearInterval(batchTimer);

        const durationMs = Date.now() - startTime;

        if (this.sessionId) {
            await completeGatewayRequest(request.requestId, this.sessionId, {
                content: content || '',
                toolCalls,
                error,
            }).catch((err) => {
                this.log(`Complete report failed: ${err instanceof Error ? err.message : err}`);
            });
        }

        if (success) {
            this.state.completedCount++;
            this.emit('event', { type: 'request_completed', request, durationMs } as GatewayEvent);
        } else {
            this.state.failedCount++;
            this.emit('event', { type: 'request_failed', request, error: error || 'Unknown' } as GatewayEvent);
        }

        this.state.currentRequest = undefined;
    }

    private log(message: string): void {
        if (this.config.debug) {
            console.error(`[Gateway] ${message}`);
        }
    }
}

let gatewayInstance: GatewayService | null = null;

export function getGateway(config?: Partial<GatewayConfig>): GatewayService {
    if (!gatewayInstance) {
        gatewayInstance = new GatewayService(config);
    }
    return gatewayInstance;
}

export function resetGateway(): void {
    if (gatewayInstance) {
        gatewayInstance.stop().catch(() => {});
        gatewayInstance = null;
    }
}
