/**
 * useAgentStream Hook
 * Custom hook for managing agent streaming communication
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import os from 'os';
import { agentService } from '../../agent/service.js';
import type { McpState, McpToolResult, AgentStreamCallbacks } from '../../agent/types.js';
import { onLoopPrompt, setAgentBusyChecker } from '../../mcp/loop.js';
import { onContextAction, consumeCompactSummary } from '../../mcp/context-tools.js';

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
    modelTier?: 'lite' | 'flash' | 'pro';
}

export interface UseAgentStreamReturn {
    messages: Message[];
    isProcessing: boolean;
    currentToolCall: { name: string; type: 'tool' | 'mcp'; serverName?: string } | null;
    streamingText: string;
    sendMessage: (message: string) => Promise<void>;
    abort: () => void;
}

const MAX_MESSAGE_HISTORY = 100;

function trimMessages(msgs: Message[]): Message[] {
    if (msgs.length <= MAX_MESSAGE_HISTORY) return msgs;
    return msgs.slice(msgs.length - MAX_MESSAGE_HISTORY);
}

export function useAgentStream(options: UseAgentStreamOptions = {}): UseAgentStreamReturn {
    const { mcpState, onMcpToolCall, cliMode = false, modelTier } = options;

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
        // If there's a pending compact summary from a previous paean_context_compact
        // call, prepend it so the new conversation starts with context.
        const compactSummary = consumeCompactSummary();
        const effectiveMessage = compactSummary
            ? `[Context from previous conversation]\n${compactSummary}\n\n[New message]\n${message}`
            : message;

        // Add user message
        const userMessageId = `user-${Date.now()}`;
        setMessages(prev => trimMessages([...prev, {
            id: userMessageId,
            role: 'user',
            content: message,
        }]));

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
                setMessages(prev => trimMessages([...prev, {
                    id: assistantMessageId,
                    role: 'assistant',
                    content: responseText,
                }]));

                setIsProcessing(false);
                setCurrentToolCall(null);
                setStreamingText('');
                abortRef.current = null;
            },

            onError: (error) => {
                // Add error as assistant message
                const errorMessageId = `error-${Date.now()}`;
                setMessages(prev => trimMessages([...prev, {
                    id: errorMessageId,
                    role: 'assistant',
                    content: `Error: ${error}`,
                }]));

                setIsProcessing(false);
                setCurrentToolCall(null);
                setStreamingText('');
                abortRef.current = null;
            },
        };

        try {
            const { abort: abortFn } = await agentService.streamMessage(effectiveMessage, callbacks, {
                conversationId: conversationIdRef.current,
                mcpState,
                cliMode: cliMode ? { enabled: true, cwd: process.cwd(), platform: process.platform, hostname: os.hostname(), channel: 'cli' } : undefined,
                modelTier,
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

    // Subscribe to loop prompt events and auto-send when idle.
    // IMPORTANT: Only inject the task prompt — never include loop metadata
    // (schedule, cron expression) in the message sent to the agent.  Including
    // e.g. "[Loop: 0 * * * *]" causes the agent to misinterpret the cron
    // expression as a request to create a new loop instead of executing the task.
    // UI display of the loop label is handled separately.
    useEffect(() => {
        const unsubscribe = onLoopPrompt((event) => {
            if (!isProcessingRef.current) {
                if (event.clear) {
                    conversationIdRef.current = undefined;
                    setConversationId(undefined);
                }
                sendMessage(`[Scheduled task execution] ${event.prompt}`);
            }
        });
        return unsubscribe;
    }, [sendMessage]);

    // Subscribe to context management events (clear / compact)
    useEffect(() => {
        const unsubscribe = onContextAction((event) => {
            if (event.action === 'clear') {
                conversationIdRef.current = undefined;
            } else if (event.action === 'compact') {
                // Reset conversationId — the compact summary is stored via
                // consumeCompactSummary() and will be prepended to the next
                // user message automatically by sendMessage.
                conversationIdRef.current = undefined;
            }
        });
        return unsubscribe;
    }, []);

    return {
        messages,
        isProcessing,
        currentToolCall,
        streamingText,
        sendMessage,
        abort,
    };
}
