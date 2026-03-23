/**
 * useAgentStream Hook
 * Custom hook for managing agent streaming communication
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { agentService } from '../../agent/service.js';
import type { McpState, McpToolResult, AgentStreamCallbacks } from '../../agent/types.js';
import { onCronPrompt, setAgentBusyChecker } from '../../mcp/cron.js';

export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    isStreaming?: boolean;
    toolCalls?: Array<{
        id: string;
        name: string;
        type: 'tool' | 'mcp';
        serverName?: string;
        status: 'pending' | 'completed' | 'error';
    }>;
}

export interface UseAgentStreamOptions {
    mcpState?: McpState;
    onMcpToolCall?: (
        callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ) => Promise<McpToolResult>;
    cliMode?: boolean;
}

export interface UseAgentStreamReturn {
    messages: Message[];
    isProcessing: boolean;
    currentToolCall: { name: string; type: 'tool' | 'mcp'; serverName?: string } | null;
    streamingText: string;
    sendMessage: (message: string) => Promise<void>;
    abort: () => void;
}

export function useAgentStream(options: UseAgentStreamOptions = {}): UseAgentStreamReturn {
    const { mcpState, onMcpToolCall, cliMode = false } = options;

    const [messages, setMessages] = useState<Message[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentToolCall, setCurrentToolCall] = useState<{ name: string; type: 'tool' | 'mcp'; serverName?: string } | null>(null);
    const [streamingText, setStreamingText] = useState('');

    const conversationIdRef = useRef<string | undefined>(undefined);
    const abortRef = useRef<(() => void) | null>(null);

    const abort = useCallback(() => {
        if (abortRef.current) {
            abortRef.current();
            abortRef.current = null;
        }
        setIsProcessing(false);
        setCurrentToolCall(null);
        setStreamingText('');
    }, []);

    const sendMessage = useCallback(async (message: string) => {
        // Add user message
        const userMessageId = `user-${Date.now()}`;
        setMessages(prev => [...prev, {
            id: userMessageId,
            role: 'user',
            content: message,
        }]);

        setIsProcessing(true);
        setStreamingText('');

        let responseText = '';

        const callbacks: AgentStreamCallbacks = {
            onContent: (text, partial) => {
                if (partial) {
                    responseText += text;
                } else {
                    responseText = text;
                }
                setStreamingText(responseText);
            },

            onToolCall: (_id, name) => {
                setCurrentToolCall({ name, type: 'tool' });
            },

            onToolResult: () => {
                setCurrentToolCall(null);
            },

            onMcpToolCall: async (callId, serverName, toolName, args) => {
                setCurrentToolCall({ name: toolName, type: 'mcp', serverName });

                if (onMcpToolCall) {
                    try {
                        const result = await onMcpToolCall(callId, serverName, toolName, args);
                        setCurrentToolCall(null);
                        return result;
                    } catch (error) {
                        setCurrentToolCall(null);
                        return {
                            content: [{ type: 'text' as const, text: `Error: ${(error as Error).message}` }],
                            isError: true,
                        };
                    }
                }

                setCurrentToolCall(null);
                return {
                    content: [{ type: 'text' as const, text: 'MCP not available' }],
                    isError: true,
                };
            },

            onDone: (convId) => {
                conversationIdRef.current = convId;

                // Add assistant message
                const assistantMessageId = `assistant-${Date.now()}`;
                setMessages(prev => [...prev, {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: responseText,
                }]);

                setIsProcessing(false);
                setCurrentToolCall(null);
                setStreamingText('');
                abortRef.current = null;
            },

            onError: (error) => {
                // Add error as assistant message
                const errorMessageId = `error-${Date.now()}`;
                setMessages(prev => [...prev, {
                    id: errorMessageId,
                    role: 'assistant',
                    content: `Error: ${error}`,
                }]);

                setIsProcessing(false);
                setCurrentToolCall(null);
                setStreamingText('');
                abortRef.current = null;
            },
        };

        try {
            const { abort: abortFn } = await agentService.streamMessage(message, callbacks, {
                conversationId: conversationIdRef.current,
                mcpState,
                cliMode: cliMode ? { enabled: true, cwd: process.cwd(), platform: process.platform, channel: 'cli' } : undefined,
            });
            abortRef.current = abortFn;
        } catch (error) {
            callbacks.onError?.((error as Error).message);
        }
    }, [mcpState, onMcpToolCall, cliMode]);

    // Register agent-busy checker so the cron scheduler knows when to skip
    const isProcessingRef = useRef(isProcessing);
    isProcessingRef.current = isProcessing;

    useEffect(() => {
        setAgentBusyChecker(() => isProcessingRef.current);
    }, []);

    // Subscribe to cron prompt events and auto-send when idle
    useEffect(() => {
        const unsubscribe = onCronPrompt((event) => {
            if (!isProcessingRef.current) {
                sendMessage(`[Scheduled Task: ${event.schedule}] ${event.prompt}`);
            }
        });
        return unsubscribe;
    }, [sendMessage]);

    return {
        messages,
        isProcessing,
        currentToolCall,
        streamingText,
        sendMessage,
        abort,
    };
}
