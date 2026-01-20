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
 * Stream options for agent messages
 */
export interface StreamOptions {
    conversationId?: string;
    mcpState?: McpState;
    cliMode?: Partial<CliModeOptions>;
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
            callbacks.onError?.('Authentication required. Run `paean login` first.');
            return { abort: () => this.abortController?.abort() };
        }

        try {
            const response = await fetch(`${getApiUrl()}/agent/stream`, {
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
                }),
                signal: this.abortController.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(
                    (errorData as { error?: string }).error || `HTTP ${response.status}`
                );
            }

            if (!response.body) {
                throw new Error('No response body');
            }

            // Process the SSE stream
            await this.processStream(response.body, callbacks, conversationId);
        } catch (error) {
            if ((error as Error).name === 'AbortError') {
                // User aborted, this is expected
                return { abort: () => { } };
            }
            callbacks.onError?.((error as Error).message || 'Unknown error');
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

        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const eventData = JSON.parse(line.slice(6)) as AgentStreamEvent;
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
                if (event.data.conversationId) {
                    callbacks.onDone?.(event.data.conversationId);
                }
                break;

            case 'error':
                callbacks.onError?.(event.data.error || 'Unknown error');
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
