/**
 * Agent Command
 * Interactive agent mode for AI-powered conversations
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { isAuthenticated } from '../utils/config.js';
import { startScrollingChat, startFullscreenChat } from '../agent/chat.ink.js';
import { McpClient } from '../mcp/client.js';
import { loadCustomToolsFromJson } from '../mcp/tools.js';
import type { McpState, McpToolResult } from '../agent/types.js';

export const agentCommand = new Command('agent')
    .description('Start interactive AI agent mode (default)')
    .option('--no-mcp', 'Disable local MCP server integration')
    .option('--fullscreen', 'Enable fullscreen mode (default: scrolling mode)')
    .option('-d, --debug', 'Enable debug logging')
    .option('-m, --message <message>', 'Send a single message and exit')
    .option('--gateway', 'Enable gateway relay for remote clients')
    .option('--worker', 'Enable background worker for task processing')
    .option('--gateway-interval <ms>', 'Gateway poll interval in milliseconds', '3000')
    .option('--worker-interval <ms>', 'Worker poll interval in milliseconds', '30000')
    .action(async (options) => {
        if (!isAuthenticated()) {
            console.log(chalk.yellow('⚠️  Not logged in. Run `openpaean login` first.\n'));
            process.exit(1);
        }

        await runAgentMode({
            mcp: options.mcp !== false,
            fullscreen: options.fullscreen === true,
            debug: options.debug ?? false,
            message: options.message,
            gatewayEnabled: options.gateway ?? false,
            gatewayPollInterval: parseInt(options.gatewayInterval, 10) || 3000,
            workerEnabled: options.worker ?? false,
            workerPollInterval: parseInt(options.workerInterval, 10) || 30000,
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
    gatewayEnabled?: boolean;
    gatewayPollInterval?: number;
    workerEnabled?: boolean;
    workerPollInterval?: number;
}): Promise<void> {
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

    // Load custom MCP tools from JSON definition files
    // Supports: .openpaean/mcp_tools.json (project-level)
    // and ~/.openpaean/mcp_tools.json (global-level)
    // Legacy paths (.paean/...) are also supported for backward compatibility.
    try {
        const { join } = await import('path');
        const { homedir } = await import('os');

        const projectToolsPaths = [
            join(process.cwd(), '.paean', 'mcp_tools.json'),
            join(process.cwd(), '.openpaean', 'mcp_tools.json'),
        ];

        const globalToolsPaths = [
            join(homedir(), '.paean', 'mcp_tools.json'),
            join(homedir(), '.openpaean', 'mcp_tools.json'),
        ];

        // Load project-level custom tools (legacy first, then current)
        for (const projectToolsPath of projectToolsPaths) {
            const projectCount = await loadCustomToolsFromJson(projectToolsPath);
            if (projectCount > 0 && debug) {
                console.log(chalk.dim(`[MCP] Loaded ${projectCount} custom tool(s) from ${projectToolsPath}`));
            }
        }

        // Load global custom tools (legacy first, then current)
        for (const globalToolsPath of globalToolsPaths) {
            const globalCount = await loadCustomToolsFromJson(globalToolsPath);
            if (globalCount > 0 && debug) {
                console.log(chalk.dim(`[MCP] Loaded ${globalCount} custom tool(s) from ${globalToolsPath}`));
            }
        }
    } catch (error) {
        if (debug) {
            console.log(chalk.dim(`[MCP] Custom tools loading skipped: ${(error as Error).message}`));
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

    // Initialize gateway service if enabled
    let gatewayService: import('../gateway/service.js').GatewayService | undefined;
    if (options.gatewayEnabled) {
        const { GatewayService } = await import('../gateway/service.js');
        gatewayService = new GatewayService({
            pollInterval: options.gatewayPollInterval ?? 3000,
            debug,
        });
        gatewayService.setMcpState(mcpState, onMcpToolCall, mcpClient);
        if (debug) {
            console.log(chalk.dim('[Gateway] Enabled — polling for remote requests'));
        }
    }

    // Initialize worker service if enabled
    let workerService: import('../worker/service.js').WorkerService | undefined;
    if (options.workerEnabled) {
        const { WorkerService } = await import('../worker/service.js');
        workerService = new WorkerService({
            pollInterval: options.workerPollInterval ?? 30000,
            debug,
            autonomousMode: true,
        });
        workerService.setMcpState(mcpState, onMcpToolCall, mcpClient);
        if (gatewayService) {
            workerService.setIdleCheck(() => !gatewayService!.isProcessingRemote());
        }
        if (debug) {
            console.log(chalk.dim('[Worker] Enabled — polling for tasks'));
        }
    }

    // Start interactive chat (scrolling mode by default, fullscreen if requested)
    try {
        // Start background services
        if (gatewayService) {
            gatewayService.start().catch((err) => {
                console.log(chalk.yellow(`Gateway failed to start: ${err instanceof Error ? err.message : err}`));
            });
        }
        if (workerService) {
            workerService.start().catch((err) => {
                console.log(chalk.yellow(`Worker failed to start: ${err instanceof Error ? err.message : err}`));
            });
        }

        if (enableFullscreen) {
            await startFullscreenChat({
                mcpState,
                onMcpToolCall,
                debug,
            });
        } else {
            await startScrollingChat({
                mcpState,
                onMcpToolCall,
                debug,
            });
        }
    } finally {
        // Cleanup gateway, worker, and MCP connections on exit
        if (gatewayService) {
            await gatewayService.stop().catch(() => {});
        }
        if (workerService) {
            await workerService.stop().catch(() => {});
        }
        await mcpClient?.disconnectAll();
    }
}
