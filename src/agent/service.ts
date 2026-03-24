/**
 * Agent Service
 * SSE-based streaming agent service for communicating with Paean AI cloud
 */

import { getToken, getApiUrl } from '../utils/config.js';
import type { CliModeOptions } from './cli-mode.js';
import type {
    AgentStreamEvent,
    AgentStreamCallbacks,
    McpState,
    McpToolResult,
} from './types.js';

/**
 * Extract a human-readable error message from an unknown value.
 * Handles: string, Error, { error: string | { message } }, { message }, plain objects.
 */
export function extractErrorMessage(value: unknown): string {
    if (typeof value === 'string') return value;
    if (value instanceof Error) return value.message;
    if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (obj.error) {
            if (typeof obj.error === 'string') return obj.error;
            if (typeof obj.error === 'object' && obj.error !== null) {
                const inner = obj.error as Record<string, unknown>;
                if (typeof inner.message === 'string') return inner.message;
            }
        }
        if (typeof obj.message === 'string') return obj.message;
    }
    try {
        const s = String(value);
        return s === '[object Object]' ? 'Unknown error' : s;
    } catch {
        return 'Unknown error';
    }
}

/** CLI model tier: Paean Lite / Flash / Pro */
export type CliModelTier = 'lite' | 'flash' | 'pro';

/**
 * Stream options for agent messages
 */
export interface StreamOptions {
    conversationId?: string;
    mcpState?: McpState;
    cliMode?: Partial<CliModeOptions>;
    modelTier?: CliModelTier;
}

/**
 * Agent Service class for streaming communication
 */
export class AgentService {
    private abortController: AbortController | null = null;

    /**
     * Stream a message to the agent and handle SSE events
     */
    async streamMessage(
        message: string,
        callbacks: AgentStreamCallbacks,
        options?: StreamOptions
    ): Promise<{ abort: () => void }> {
        this.abortController = new AbortController();
        const { conversationId, mcpState } = options || {};

        const token = getToken();
        if (!token) {
            callbacks.onError?.('Authentication required. Run `openpaean login` first.');
            return { abort: () => this.abortController?.abort() };
        }

        try {
            const response = await fetch(`${getApiUrl()}/agent/cli/stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                    Accept: 'text/event-stream',
                },
                body: JSON.stringify({
                    message,
                    conversationId,
                    mcpState,
                    cliMode: options?.cliMode,
                    modelTier: options?.modelTier || 'flash',
                }),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                let errorMessage = `HTTP ${response.status}`;
                try {
                    const errorData = await response.json();
                    errorMessage = extractErrorMessage(errorData) || response.statusText || errorMessage;
                } catch {
                    errorMessage = response.statusText || errorMessage;
                }
                throw new Error(errorMessage);
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Process the SSE stream
            await this.processStream(response.body, callbacks, conversationId);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                return { abort: () => { } };
            }
            const errorMessage = error instanceof Error
                ? error.message
                : 'Unknown error occurred';
            callbacks.onError?.(errorMessage);
        }

        return { abort: () => this.abortController?.abort() };
    }

    /**
     * Process SSE stream
     */
    private async processStream(
        body: ReadableStream<Uint8Array>,
        callbacks: AgentStreamCallbacks,
        conversationId?: string
    ): Promise<void> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let receivedDoneEvent = false;

        try {
            while (true) {
                if (this.abortController?.signal.aborted) {
                    await reader.cancel();
                    break;
                }

                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                if (this.abortController?.signal.aborted) {
                    await reader.cancel();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const eventData = JSON.parse(line.slice(6)) as AgentStreamEvent;
                            if (eventData.type === 'done') {
                                receivedDoneEvent = true;
                            }
                            await this.handleEvent(eventData, callbacks, conversationId);
                        } catch {
                            // Skip invalid JSON
                        }
                    }
                }
            }
        } finally {
            reader.releaseLock();
        }

        if (!receivedDoneEvent && !this.abortController?.signal.aborted) {
            callbacks.onError?.('Stream ended unexpectedly. The server may have disconnected.');
        }
    }

    /**
     * Handle individual SSE events
     */
    private async handleEvent(
        event: AgentStreamEvent,
        callbacks: AgentStreamCallbacks,
        conversationId?: string
    ): Promise<void> {
        switch (event.type) {
            case 'content':
                if (event.data.text !== undefined) {
                    callbacks.onContent?.(event.data.text, event.data.partial ?? false);
                }
                break;

            case 'tool_call':
                if (event.data.id && event.data.name) {
                    callbacks.onToolCall?.(event.data.id, event.data.name);
                }
                break;

            case 'tool_result':
                if (event.data.id && event.data.name) {
                    callbacks.onToolResult?.(
                        event.data.id,
                        event.data.name,
                        event.data.result
                    );
                }
                break;

            case 'mcp_tool_call':
                if (
                    event.data.callId &&
                    event.data.serverName &&
                    event.data.toolName &&
                    callbacks.onMcpToolCall
                ) {
                    const mcpConversationId =
                        event.data.conversationId || conversationId;

                    // Parse arguments - could be in argumentsJson or arguments
                    let args: Record<string, unknown> = {};
                    if (event.data.argumentsJson) {
                        try {
                            args = JSON.parse(event.data.argumentsJson);
                        } catch {
                            args = {};
                        }
                    } else if (event.data.arguments) {
                        args = event.data.arguments;
                    }

                    try {
                        const result = await callbacks.onMcpToolCall(
                            event.data.callId,
                            event.data.serverName,
                            event.data.toolName,
                            args
                        );

                        // Submit result back to API
                        if (mcpConversationId) {
                            await this.submitMcpResult(
                                mcpConversationId,
                                event.data.callId,
                                result
                            );
                        }
                    } catch (error) {
                        // Submit error result
                        if (mcpConversationId) {
                            await this.submitMcpResult(
                                mcpConversationId,
                                event.data.callId,
                                {
                                    content: [
                                        { type: 'text', text: `Error: ${(error as Error).message}` },
                                    ],
                                    isError: true,
                                }
                            );
                        }
                    }
                }
                break;

            case 'done':
                callbacks.onDone?.(event.data.conversationId);
                break;

            case 'grounding':
                if (event.data.sources && Array.isArray(event.data.sources)) {
                    callbacks.onGrounding?.(event.data.sources);
                }
                break;

            case 'error':
                callbacks.onError?.(
                    typeof event.data.error === 'string'
                        ? event.data.error
                        : extractErrorMessage(event.data.error) || 'Unknown error'
                );
                break;
        }
    }

    /**
     * Submit MCP tool result back to the API
     */
    async submitMcpResult(
        conversationId: string,
        callId: string,
        result: McpToolResult
    ): Promise<boolean> {
        const token = getToken();
        if (!token) return false;

        try {
            const response = await fetch(`${getApiUrl()}/agent/mcp-result`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ conversationId, callId, result }),
            });

            const data = (await response.json()) as { success?: boolean };
            return data.success === true;
        } catch {
            return false;
        }
    }

    /**
     * Abort the current stream
     */
    abort(): void {
        this.abortController?.abort();
    }
}

// Export singleton instance
export const agentService = new AgentService();
