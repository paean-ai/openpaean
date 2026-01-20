/**
 * useCommands Hook
 * Handles slash commands for the CLI
 */

import { useCallback, useState } from 'react';

export interface CommandResult {
    handled: boolean;
    output?: string;
    action?: 'exit' | 'clear' | 'toggle-raw' | 'toggle-debug';
}

export interface UseCommandsOptions {
    mcpServers?: Array<{ name: string; tools?: Array<{ name: string }> }>;
    onToggleRaw?: () => void;
    onToggleDebug?: () => void;
    onExit?: () => void;
    onClear?: () => void;
}

export interface UseCommandsReturn {
    rawMode: boolean;
    debugMode: boolean;
    handleCommand: (input: string) => CommandResult;
    getHelp: () => string;
    getMcpStatus: () => string;
    getCompletions: (partial: string) => string[];
}

export function useCommands(options: UseCommandsOptions = {}): UseCommandsReturn {
    const { mcpServers = [] } = options;

    const [rawMode, setRawMode] = useState(false);
    const [debugMode, setDebugMode] = useState(false);

    // Available commands for completion
    const COMMANDS = [
        '/exit', '/quit', '/q',
        '/clear', '/cls',
        '/help', '/h', '/?',
        '/debug',
        '/mcp',
        '/raw',
    ];

    const getHelp = useCallback(() => {
        return `
  Available Commands:

    /exit        Exit the chat session (/quit, /q)
    /quit        Exit the chat session
    /clear       Clear the screen (/cls)
    /help        Show available commands (/h, /?)
    /debug       Toggle debug mode
    /mcp         Show MCP connection status
    /raw         Toggle raw output mode (no markdown)

  Press Tab after / to autocomplete commands
`;
    }, []);

    const getMcpStatus = useCallback(() => {
        if (mcpServers.length === 0) {
            return '\n  No MCP servers connected\n';
        }

        let status = '\n  MCP Connections:\n\n';
        for (const server of mcpServers) {
            const toolCount = server.tools?.length || 0;
            status += `    ${server.name}: ${toolCount} tools\n`;
        }
        return status;
    }, [mcpServers]);

    // Get command completions for partial input
    const getCompletions = useCallback((partial: string): string[] => {
        if (!partial.startsWith('/')) {
            return [];
        }
        const lower = partial.toLowerCase();
        return COMMANDS.filter(cmd => cmd.startsWith(lower));
    }, []);

    const handleCommand = useCallback((input: string): CommandResult => {
        const cmd = input.toLowerCase().trim();

        switch (cmd) {
            case '/exit':
            case '/quit':
            case '/q':
                return { handled: true, action: 'exit' };

            case '/clear':
            case '/cls':
                return { handled: true, action: 'clear' };

            case '/help':
            case '/h':
            case '/?':
                return { handled: true, output: getHelp() };

            case '/debug':
                setDebugMode(prev => !prev);
                const newDebugState = !debugMode;
                return {
                    handled: true,
                    output: `  Debug mode: ${newDebugState ? 'ON' : 'OFF'}`,
                    action: 'toggle-debug'
                };

            case '/raw':
                setRawMode(prev => !prev);
                const newRawState = !rawMode;
                let output = `  Raw mode: ${newRawState ? 'ON' : 'OFF'}`;
                if (newRawState) {
                    output += '\n  Agent will return plain text (no markdown)';
                }
                return {
                    handled: true,
                    output,
                    action: 'toggle-raw'
                };

            case '/mcp':
                return { handled: true, output: getMcpStatus() };

            default:
                if (cmd.startsWith('/')) {
                    return {
                        handled: true,
                        output: `\n  Unknown command: ${cmd}\n  Type /help for available commands\n`
                    };
                }
                return { handled: false };
        }
    }, [debugMode, rawMode, getHelp, getMcpStatus]);

    return {
        rawMode,
        debugMode,
        handleCommand,
        getHelp,
        getMcpStatus,
        getCompletions,
    };
}
