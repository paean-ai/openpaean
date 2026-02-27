/**
 * PaeanClaw Executor
 * HTTP-based executor that delegates tasks to a running PaeanClaw local agent runtime.
 * Unlike other executors that spawn CLI processes, this communicates via PaeanClaw's
 * HTTP API (POST /api/chat with SSE streaming), enabling persistent context,
 * pre-connected MCP tools, and configurable LLM backends.
 *
 * https://github.com/paean-ai/paeanclaw
 */

import type { ExecutorOptions, ExecutorResult, AvailabilityStatus } from '../types.js';
import type { AgentExecutor } from './index.js';

const DEFAULT_BASE_URL = 'http://localhost:3007';
const CONNECT_TIMEOUT_MS = 3000;

function resolveBaseUrl(overrideUrl?: string): string {
    return overrideUrl || process.env.PAEANCLAW_URL || DEFAULT_BASE_URL;
}

async function* parseSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                    yield JSON.parse(payload);
                } catch {
                    // skip malformed JSON
                }
            }
        }
    } finally {
        reader.releaseLock();
    }
}

export class PaeanclawExecutor implements AgentExecutor {
    readonly type = 'paeanclaw' as const;
    private baseUrl: string;
    private abortController: AbortController | null = null;

    constructor(baseUrl?: string) {
        this.baseUrl = resolveBaseUrl(baseUrl);
    }

    async isAvailable(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
            const res = await fetch(`${this.baseUrl}/api/conversations`, {
                signal: controller.signal,
            });
            clearTimeout(timer);
            return res.ok;
        } catch {
            return false;
        }
    }

    async checkAvailability(): Promise<AvailabilityStatus> {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
            const res = await fetch(`${this.baseUrl}/api/conversations`, {
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (!res.ok) {
                return {
                    available: false,
                    binaryExists: true,
                    binaryPath: this.baseUrl,
                    authStatus: 'unknown',
                    error: `PaeanClaw returned HTTP ${res.status}`,
                };
            }

            return {
                available: true,
                binaryExists: true,
                binaryPath: this.baseUrl,
                authStatus: 'authenticated',
                version: undefined,
            };
        } catch {
            return {
                available: false,
                binaryExists: false,
                authStatus: 'unknown',
                error: `PaeanClaw not reachable at ${this.baseUrl}. Start it with: npx paeanclaw`,
            };
        }
    }

    async execute(prompt: string, options?: ExecutorOptions): Promise<ExecutorResult> {
        const startTime = Date.now();
        this.abortController = new AbortController();
        const timeout = options?.timeout ?? 600000;

        const timeoutId = setTimeout(() => {
            this.abortController?.abort();
        }, timeout);

        try {
            const res = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: prompt }),
                signal: this.abortController.signal,
            });

            if (!res.ok || !res.body) {
                clearTimeout(timeoutId);
                return {
                    success: false,
                    output: '',
                    error: `PaeanClaw HTTP ${res.status}: ${res.statusText}`,
                    durationMs: Date.now() - startTime,
                };
            }

            let fullContent = '';
            let lastError: string | undefined;

            for await (const event of parseSSE(res.body)) {
                switch (event.type) {
                    case 'content':
                        fullContent += event.text as string;
                        options?.onOutput?.(event.text as string, 'stdout');
                        break;
                    case 'tool_call':
                        options?.onOutput?.(`[paeanclaw tool: ${event.name}]\n`, 'stdout');
                        break;
                    case 'tool_result':
                        options?.onOutput?.(`[paeanclaw tool result: ${event.name}]\n`, 'stdout');
                        break;
                    case 'done':
                        if (event.content) fullContent = event.content as string;
                        break;
                    case 'error':
                        lastError = event.error as string;
                        break;
                }
            }

            clearTimeout(timeoutId);

            if (lastError) {
                return {
                    success: false,
                    output: fullContent,
                    error: lastError,
                    durationMs: Date.now() - startTime,
                };
            }

            return {
                success: true,
                output: fullContent,
                durationMs: Date.now() - startTime,
            };
        } catch (error) {
            clearTimeout(timeoutId);

            const msg = error instanceof Error ? error.message : String(error);
            const isAbort = msg.includes('abort');

            return {
                success: false,
                output: '',
                error: isAbort ? `Execution timed out after ${timeout}ms` : msg,
                durationMs: Date.now() - startTime,
            };
        }
    }

    abort(): void {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
