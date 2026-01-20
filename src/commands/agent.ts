/**
 * Agent Command
 * Interactive agent mode for AI-powered conversations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { isAuthenticated } from '../utils/config.js';
import { startScrollingChat, startFullscreenChat } from '../agent/chat.ink.js';
import { McpClient } from '../mcp/client.js';
import type { McpState, McpToolResult } from '../agent/types.js';

export const agentCommand = new Command('agent')
    .description('Start interactive AI agent mode (default)')
    .option('--no-mcp', 'Disable local MCP server integration')
    .option('--fullscreen', 'Enable fullscreen mode (default: scrolling mode)')
    .option('-d, --debug', 'Enable debug logging')
    .option('-m, --message <message>', 'Send a single message and exit')
    .action(async (options) => {
        // Check authentication
        if (!isAuthenticated()) {
            console.log(chalk.yellow('⚠️  Not logged in. Run `openpaean login` first.\n'));
            process.exit(1);
        }

        await runAgentMode({
            mcp: options.mcp !== false,
            fullscreen: options.fullscreen === true,  // Changed: fullscreen is opt-in
            debug: options.debug ?? false,
            message: options.message,
        });
    });

/**
 * Start agent mode directly (for default command)
 */
export async function runAgentMode(options: {
    mcp?: boolean;
    fullscreen?: boolean;
    debug?: boolean;
    message?: string;
}): Promise<void> {
    // Check authentication
    if (!isAuthenticated()) {
        console.log(chalk.yellow('⚠️  Not logged in. Run `openpaean login` first.\n'));
        process.exit(1);
    }

    const debug = options.debug ?? false;
    const enableMcp = options.mcp !== false;
    const enableFullscreen = options.fullscreen !== false;

    // Initialize MCP if enabled
    let mcpState: McpState | undefined;
    let mcpClient: McpClient | undefined;

    if (enableMcp) {
        mcpClient = new McpClient({ debug });
        const serverNames = mcpClient.listServers();

        if (serverNames.length > 0) {
            if (debug) {
                console.log(chalk.dim(`[MCP] Found ${serverNames.length} configured server(s)`));
            }

            // Connect to all servers
            for (const name of serverNames) {
                try {
                    if (debug) {
                        console.log(chalk.dim(`[MCP] Connecting to ${name}...`));
                    }
                    const tools = await mcpClient.connect(name);
                    if (debug) {
                        console.log(chalk.dim(`[MCP] Connected to ${name}: ${tools.length} tools`));
                    }
                } catch (error) {
                    console.log(
                        chalk.yellow(`⚠️  Failed to connect to MCP server "${name}": ${(error as Error).message}`)
                    );
                }
            }

            // Build MCP state for API
            const connectedServers = mcpClient.getConnectedServers();
            if (connectedServers.length > 0) {
                mcpState = {
                    mcpEnabled: true,
                    mcpServers: connectedServers.map((name) => ({
                        name,
                        connected: true,
                        tools: Array.from(mcpClient!.getAllTools().get(name) || []),
                    })),
                };
            }
        }
    }

    // Create MCP tool call handler
    const onMcpToolCall = async (
        _callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ): Promise<McpToolResult> => {
        if (!mcpClient) {
            return {
                content: [{ type: 'text', text: 'MCP client not available' }],
                isError: true,
            };
        }

        return mcpClient.callTool(serverName, toolName, args);
    };

    // Handle single message mode
    if (options.message) {
        const { sendMessage } = await import('../agent/chat.legacy.js');
        try {
            const response = await sendMessage(options.message, {
                mcpState,
                onMcpToolCall,
                debug,
            });
            console.log(response);
        } catch (error) {
            console.error(chalk.red(`Error: ${(error as Error).message}`));
            process.exit(1);
        } finally {
            await mcpClient?.disconnectAll();
        }
        return;
    }

    // Start interactive chat (scrolling mode by default, fullscreen if requested)
    try {
        if (enableFullscreen) {
            await startFullscreenChat({
                mcpState,
                onMcpToolCall,
                debug,
            });
        } else {
            // New default: scrolling mode (Claude Code style)
            await startScrollingChat({
                mcpState,
                onMcpToolCall,
                debug,
            });
        }
    } finally {
        // Cleanup MCP connections on exit
        await mcpClient?.disconnectAll();
    }
}
