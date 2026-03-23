/**
 * WeChat Gateway Service
 *
 * Polls WeChat ilink API for incoming messages, routes them through the
 * agent service, and sends replies back via the WeChat API.
 */

import { EventEmitter } from 'events';
import os from 'os';
import { agentService } from '../agent/service.js';
import type { AgentStreamCallbacks, McpState, McpToolResult } from '../agent/types.js';
import { executeSystemTool } from '../mcp/system.js';
import {
    getUpdates, sendTextMessage, extractText,
    MSG_TYPE_USER,
    type AccountData,
} from './api.js';
import { loadCredentials, loadSyncBuf, saveSyncBuf, saveContact } from './credentials.js';

export interface WechatGatewayConfig {
    debug?: boolean;
}

export type WechatGatewayEvent =
    | { type: 'started' }
    | { type: 'stopped' }
    | { type: 'message_received'; sender: string; text: string }
    | { type: 'reply_sent'; sender: string }
    | { type: 'processing_start'; sender: string; text: string }
    | { type: 'processing_done'; sender: string }
    | { type: 'remote_content'; text: string; partial: boolean }
    | { type: 'remote_tool_call'; id: string; name: string; serverName?: string; isMcp: boolean }
    | { type: 'remote_tool_result'; id: string; name: string; status: 'completed' | 'error' }
    | { type: 'remote_error'; error: string }
    | { type: 'error'; error: string };

const MAX_CONSECUTIVE_FAILURES = 3;
const BACKOFF_DELAY_MS = 30_000;
const RETRY_DELAY_MS = 2_000;

export class WechatGatewayService extends EventEmitter {
    private config: WechatGatewayConfig;
    private running = false;
    private account: AccountData | null = null;
    private mcpState: unknown = null;
    private onMcpToolCall: unknown = null;
    private contextTokenCache = new Map<string, string>();
    private conversationIdCache = new Map<string, string>();

    constructor(config: WechatGatewayConfig = {}) {
        super();
        this.config = config;
    }

    setMcpState(mcpState: unknown, onMcpToolCall: unknown): void {
        this.mcpState = mcpState;
        this.onMcpToolCall = onMcpToolCall;
    }

    async start(): Promise<void> {
        this.account = loadCredentials();
        if (!this.account) {
            this.emit('event', { type: 'error', error: 'No WeChat credentials. Run `openpaean wechat setup` first.' } as WechatGatewayEvent);
            return;
        }
        this.running = true;
        this.emit('event', { type: 'started' } as WechatGatewayEvent);
        this.log(`WeChat channel active (account: ${this.account.accountId})`);
        await this.pollLoop();
    }

    async stop(): Promise<void> {
        this.running = false;
        this.emit('event', { type: 'stopped' } as WechatGatewayEvent);
    }

    private async pollLoop(): Promise<void> {
        if (!this.account) return;
        let buf = loadSyncBuf();
        let failures = 0;

        while (this.running) {
            try {
                const resp = await getUpdates(this.account.baseUrl, this.account.token, buf);
                const isErr = (resp.ret !== undefined && resp.ret !== 0) || (resp.errcode !== undefined && resp.errcode !== 0);
                if (isErr) {
                    failures++;
                    this.log(`getUpdates error: ret=${resp.ret} errcode=${resp.errcode}`);
                    await this.backoff(failures);
                    continue;
                }
                failures = 0;
                if (resp.get_updates_buf) { buf = resp.get_updates_buf; saveSyncBuf(buf); }

                for (const msg of resp.msgs ?? []) {
                    if (msg.message_type !== MSG_TYPE_USER) continue;
                    const text = extractText(msg);
                    if (!text) continue;
                    const senderId = msg.from_user_id ?? 'unknown';
                    if (msg.context_token) {
                        this.contextTokenCache.set(senderId, msg.context_token);
                        saveContact(senderId, msg.context_token);
                    }
                    this.emit('event', { type: 'message_received', sender: senderId, text } as WechatGatewayEvent);
                    await this.processMessage(senderId, text);
                }
            } catch (err) {
                failures++;
                this.log(`Poll error: ${err instanceof Error ? err.message : err}`);
                await this.backoff(failures);
            }
        }
    }

    private async processMessage(senderId: string, text: string): Promise<void> {
        if (!this.account) return;
        let responseText = '';

        this.emit('event', { type: 'processing_start', sender: senderId, text } as WechatGatewayEvent);

        const callbacks: AgentStreamCallbacks = {
            onContent: (t: string, partial: boolean) => {
                if (partial) responseText += t; else responseText = t;
                this.emit('event', { type: 'remote_content', text: t, partial } as WechatGatewayEvent);
            },
            onToolCall: (id: string, name: string) => {
                this.emit('event', { type: 'remote_tool_call', id, name, isMcp: false } as WechatGatewayEvent);
            },
            onToolResult: (id: string, name: string, result?: unknown) => {
                const isError = result && typeof result === 'object' &&
                    (result as Record<string, unknown>).isError === true;
                this.emit('event', { type: 'remote_tool_result', id, name, status: isError ? 'error' : 'completed' } as WechatGatewayEvent);
            },
            onMcpToolCall: async (callId, serverName, toolName, args): Promise<McpToolResult> => {
                this.emit('event', { type: 'remote_tool_call', id: callId, name: toolName, serverName, isMcp: true } as WechatGatewayEvent);

                let mcpResult: McpToolResult;
                if (typeof this.onMcpToolCall === 'function') {
                    try {
                        mcpResult = await (this.onMcpToolCall as (c: string, s: string, t: string, a: Record<string, unknown>) => Promise<McpToolResult>)(callId, serverName, toolName, args);
                    } catch (e) {
                        mcpResult = { content: [{ type: 'text', text: `Error: ${e instanceof Error ? e.message : e}` }], isError: true };
                    }
                } else if (toolName.startsWith('paean_execute') || toolName.startsWith('paean_check') || toolName.startsWith('paean_kill')) {
                    const result = await executeSystemTool(toolName, args, { autonomousMode: true }) as { success: boolean; [k: string]: unknown };
                    mcpResult = { content: [{ type: 'text', text: JSON.stringify(result) }], isError: !result.success };
                } else {
                    mcpResult = { content: [{ type: 'text', text: 'MCP not available' }], isError: true };
                }

                this.emit('event', { type: 'remote_tool_result', id: callId, name: toolName, status: mcpResult.isError ? 'error' : 'completed' } as WechatGatewayEvent);
                return mcpResult;
            },
            onError: (error: string) => {
                this.log(`Agent error: ${error}`);
                this.emit('event', { type: 'remote_error', error } as WechatGatewayEvent);
            },
            onDone: async (convId?: string) => {
                if (convId) {
                    this.conversationIdCache.set(senderId, convId);
                }
                if (responseText && this.account) {
                    const ctx = this.contextTokenCache.get(senderId);
                    if (ctx) {
                        const maxLen = 2048;
                        for (let i = 0; i < responseText.length; i += maxLen) {
                            try {
                                await sendTextMessage(this.account.baseUrl, this.account.token, senderId, responseText.slice(i, i + maxLen), ctx);
                            } catch (e) { this.log(`Send failed: ${e instanceof Error ? e.message : e}`); }
                        }
                        this.emit('event', { type: 'reply_sent', sender: senderId } as WechatGatewayEvent);
                    }
                }
                this.emit('event', { type: 'processing_done', sender: senderId } as WechatGatewayEvent);
            },
        };

        agentService.streamMessage(text, callbacks, {
            conversationId: this.conversationIdCache.get(senderId),
            mcpState: this.mcpState as McpState | undefined,
            cliMode: {
                enabled: true,
                cwd: process.cwd(),
                platform: process.platform,
                hostname: os.hostname(),
                channel: 'wechat',
            },
        });
    }

    private async backoff(failures: number): Promise<void> {
        if (failures >= MAX_CONSECUTIVE_FAILURES) {
            await new Promise(r => setTimeout(r, BACKOFF_DELAY_MS));
        } else {
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
        }
    }

    private log(msg: string): void {
        if (this.config.debug) console.error(`[WeChat] ${msg}`);
    }
}
