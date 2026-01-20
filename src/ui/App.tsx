/**
 * App Component
 * Main Ink application for the CLI chat interface
 * Supports both inline and fullscreen modes
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Header, InputArea, Spinner, StreamingText, ToolCallIndicator } from './components/index.js';
import { useAgentStream, useCommands } from './hooks/index.js';
import type { McpState, McpToolResult } from '../agent/types.js';

export interface AppProps {
    mcpState?: McpState;
    onMcpToolCall?: (
        callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ) => Promise<McpToolResult>;
    debug?: boolean;
    fullscreen?: boolean;
}

export const App: React.FC<AppProps> = ({ mcpState, onMcpToolCall, debug: _debug = false, fullscreen = false }) => {
    const { exit } = useApp();
    const [commandOutput, setCommandOutput] = useState<string | null>(null);
    const [commandSuggestions, setCommandSuggestions] = useState<string[]>([]);

    // Calculate MCP tool count
    const mcpToolCount = mcpState?.mcpServers?.reduce(
        (sum, server) => sum + (server.tools?.length || 0),
        0
    );

    // Initialize hooks
    const { rawMode, handleCommand, getCompletions } = useCommands({
        mcpServers: mcpState?.mcpServers,
    });

    const {
        messages,
        isProcessing,
        currentToolCall,
        streamingText,
        sendMessage,
        abort,
    } = useAgentStream({
        mcpState,
        onMcpToolCall,
        cliMode: rawMode,
    });

    // Handle Ctrl+C
    useInput((input, key) => {
        if (key.ctrl && input === 'c') {
            if (isProcessing) {
                abort();
            } else {
                exit();
            }
        }
    });

    // Handle input changes for command suggestions
    const handleInputChange = useCallback((value: string) => {
        if (value.startsWith('/') && value.length > 0) {
            const completions = getCompletions(value);
            setCommandSuggestions(completions);
        } else {
            setCommandSuggestions([]);
        }
    }, [getCompletions]);

    // Handle Tab completion
    const handleTabComplete = useCallback((value: string): string | null => {
        const completions = getCompletions(value);
        if (completions.length === 1) {
            setCommandSuggestions([]);
            return completions[0];
        }
        return null;
    }, [getCompletions]);

    // Handle user input submission
    const handleSubmit = useCallback((input: string) => {
        // Clear previous command output and suggestions
        setCommandOutput(null);
        setCommandSuggestions([]);

        // Check if it's a command
        if (input.startsWith('/')) {
            const result = handleCommand(input);
            if (result.handled) {
                if (result.action === 'exit') {
                    exit();
                    return;
                }
                if (result.output) {
                    setCommandOutput(result.output);
                }
                return;
            }
        }

        // Send message to agent
        sendMessage(input);
    }, [handleCommand, sendMessage, exit]);

    return (
        <Box flexDirection="column" flexGrow={1} padding={fullscreen ? 0 : 1}>
            {/* Header - only show in non-fullscreen mode */}
            {!fullscreen && <Header mcpToolCount={mcpToolCount} />}

            {/* Message History */}
            <Box flexDirection="column" flexGrow={1} overflow="hidden">
                {messages.map((msg) => (
                    <Box key={msg.id} flexDirection="column" marginBottom={1}>
                        {msg.role === 'user' ? (
                            <Box>
                                <Text color="cyan" bold>You: </Text>
                                <Text>{msg.content}</Text>
                            </Box>
                        ) : (
                            <Box flexDirection="column">
                                <Text color="magenta" bold>OpenPaean: </Text>
                                <Text wrap="wrap">{msg.content}</Text>
                            </Box>
                        )}
                    </Box>
                ))}

                {/* Command Output */}
                {commandOutput && (
                    <Box marginBottom={1}>
                        <Text dimColor>{commandOutput}</Text>
                    </Box>
                )}

                {/* Current Tool Call */}
                {currentToolCall && (
                    <Box marginBottom={1}>
                        <ToolCallIndicator
                            name={currentToolCall.name}
                            type={currentToolCall.type}
                            serverName={currentToolCall.serverName}
                            status="pending"
                        />
                    </Box>
                )}

                {/* Streaming Response */}
                {isProcessing && streamingText && (
                    <Box marginBottom={1}>
                        <StreamingText
                            text={streamingText}
                            isComplete={false}
                            rawMode={rawMode}
                        />
                    </Box>
                )}

                {/* Loading Spinner */}
                {isProcessing && !streamingText && !currentToolCall && (
                    <Box marginBottom={1}>
                        <Spinner label="Thinking..." type="thinking" />
                    </Box>
                )}
            </Box>

            {/* Input Area */}
            <InputArea
                onSubmit={handleSubmit}
                onInputChange={handleInputChange}
                onTabComplete={handleTabComplete}
                suggestions={commandSuggestions}
                disabled={isProcessing}
            />
        </Box>
    );
};
