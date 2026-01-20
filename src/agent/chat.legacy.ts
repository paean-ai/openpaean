/**
 * Interactive Chat Loop
 * Handles user input and agent responses in a REPL-style interface
 * Features: Dynamic spinners, Tab completion, CLI-friendly mode
 */

import * as readline from 'readline';
import chalk from 'chalk';
import { agentService } from './service.js';
import {
    renderMarkdown,
    renderError,
    renderPrompt,
    renderAgentLabel,
    renderWelcome,
    renderGoodbye,
    renderThinking,
} from './renderer.js';
// Spinner imports (kept for future use)
// import {
//     createThinkingSpinner,
//     createMcpSpinner,
//     type SpinnerController,
// } from './spinner.js';
import {
    commandCompleter,
    renderCommandHelp,
} from './completer.js';
import {
    isCliModeActive,
    isRawStreamEnabled,
    type CliModeOptions,
} from './cli-mode.js';
import type { McpState, McpToolResult, AgentStreamCallbacks } from './types.js';

/**
 * Chat options
 */
export interface ChatOptions {
    mcpState?: McpState;
    onMcpToolCall?: (
        callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ) => Promise<McpToolResult>;
    debug?: boolean;
    cliMode?: Partial<CliModeOptions>;
}

/**
 * Start the interactive chat loop
 */
export async function startChat(options: ChatOptions = {}): Promise<void> {
    const { mcpState, onMcpToolCall, debug } = options;

    // CLI mode state
    let cliModeEnabled = isCliModeActive(options.cliMode);
    let rawStreamEnabled = isRawStreamEnabled(options.cliMode);

    // Calculate total MCP tools
    const mcpToolCount = mcpState?.mcpServers?.reduce(
        (sum, server) => sum + (server.tools?.length || 0),
        0
    );

    // Print welcome message
    console.log(renderWelcome(mcpToolCount));

    // Create readline interface with completer
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: true,
        completer: commandCompleter,
    });

    let conversationId: string | undefined;
    let isProcessing = false;
    let currentStreamAbort: (() => void) | null = null;

    // Handle Ctrl+C
    const handleSigint = () => {
        if (isProcessing) {
            // Abort current stream
            if (currentStreamAbort) {
                currentStreamAbort();
            }
            console.log(chalk.dim('\n(interrupted)'));
            isProcessing = false;
            currentStreamAbort = null;
            promptUser();
        } else {
            // Exit
            console.log(renderGoodbye());
            rl.close();
            process.exit(0);
        }
    };

    process.on('SIGINT', handleSigint);

    // Prompt for user input
    const promptUser = () => {
        rl.question(renderPrompt(), async (input) => {
            const trimmedInput = input.trim();

            if (!trimmedInput) {
                promptUser();
                return;
            }

            // Handle slash commands
            if (trimmedInput.startsWith('/')) {
                const handled = handleCommand(trimmedInput);
                if (handled) {
                    promptUser();
                    return;
                }
            }

            // Process the message
            await processMessage(trimmedInput);
            promptUser();
        });
    };

    // Handle slash commands
    const handleCommand = (input: string): boolean => {
        const cmd = input.toLowerCase();

        switch (cmd) {
            case '/exit':
            case '/quit':
            case '/q':
                console.log(renderGoodbye());
                rl.close();
                process.exit(0);

            case '/clear':
            case '/cls':
                console.clear();
                console.log(renderWelcome(mcpToolCount));
                return true;

            case '/help':
            case '/h':
            case '/?':
                console.log(renderCommandHelp());
                return true;

            case '/debug':
                options.debug = !options.debug;
                console.log(
                    chalk.dim(`  Debug mode: ${options.debug ? chalk.green('ON') : chalk.red('OFF')}`)
                );
                console.log('');
                return true;

            case '/raw':
                cliModeEnabled = !cliModeEnabled;
                rawStreamEnabled = cliModeEnabled;
                console.log(
                    chalk.dim(`  Raw mode: ${cliModeEnabled ? chalk.green('ON') : chalk.red('OFF')}`)
                );
                if (cliModeEnabled) {
                    console.log(chalk.dim('  Agent will return plain text (no markdown)'));
                }
                console.log('');
                return true;

            case '/mcp':
                if (mcpState?.mcpServers && mcpState.mcpServers.length > 0) {
                    console.log(chalk.bold.cyan('\n  MCP Connections:\n'));
                    for (const server of mcpState.mcpServers) {
                        const toolCount = server.tools?.length || 0;
                        console.log(
                            `    ${chalk.yellow(server.name)}: ${chalk.green(toolCount)} tools`
                        );
                    }
                    console.log('');
                } else {
                    console.log(chalk.dim('\n  No MCP servers connected\n'));
                }
                return true;

            default:
                // Unknown command
                if (cmd.startsWith('/')) {
                    console.log(chalk.dim(`\n  Unknown command: ${cmd}`));
                    console.log(chalk.dim('  Type /help for available commands\n'));
                    return true;
                }
                return false;
        }
    };

    // Process a message - simplified version following old working pattern
    const processMessage = async (message: string): Promise<void> => {
        isProcessing = true;
        let responseText = '';
        let isFirstContent = true;

        // Print thinking indicator (use simple text, not ora spinner)
        process.stdout.write('\n' + renderThinking());

        const callbacks: AgentStreamCallbacks = {
            onContent: (text, partial) => {
                if (rawStreamEnabled && partial) {
                    // Raw stream mode: output directly
                    if (isFirstContent) {
                        process.stdout.write('\r\x1b[K'); // Clear thinking
                        process.stdout.write(renderAgentLabel());
                        isFirstContent = false;
                    }
                    process.stdout.write(text);
                } else {
                    // Buffered mode: accumulate text
                    if (partial) {
                        responseText += text;
                    } else {
                        responseText = text;
                    }
                }
            },

            onToolCall: (_id, name) => {
                if (debug) {
                    process.stdout.write('\r\x1b[K');
                    console.log(chalk.dim(`  🔧 ${name}...`));
                    process.stdout.write(renderThinking());
                }
            },

            onToolResult: (_id, _name) => {
                if (debug) {
                    process.stdout.write('\r\x1b[K');
                    process.stdout.write(renderThinking());
                }
            },

            onMcpToolCall: async (callId, serverName, toolName, args) => {
                // Clear thinking and show MCP call
                process.stdout.write('\r\x1b[K');
                console.log(chalk.dim(`  🔌 MCP: ${serverName} → ${toolName}`));

                if (onMcpToolCall) {
                    try {
                        const result = await onMcpToolCall(
                            callId,
                            serverName,
                            toolName,
                            args
                        );
                        console.log(
                            chalk.dim(`  ✓ MCP: ${serverName} → ${toolName} completed`)
                        );
                        // Restore thinking indicator
                        process.stdout.write(renderThinking());
                        return result;
                    } catch (error) {
                        console.log(
                            chalk.dim(`  ✗ MCP: ${serverName} → ${toolName} failed`)
                        );
                        process.stdout.write(renderThinking());
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: `Error: ${(error as Error).message}`,
                                },
                            ],
                            isError: true,
                        };
                    }
                }

                process.stdout.write(renderThinking());
                return {
                    content: [{ type: 'text' as const, text: 'MCP not available' }],
                    isError: true,
                };
            },

            onDone: (convId) => {
                conversationId = convId;
                // Clear thinking indicator
                process.stdout.write('\r\x1b[K');

                if (responseText) {
                    if (rawStreamEnabled) {
                        // Raw mode: just add newline (content already streamed)
                        console.log('');
                    } else {
                        // Markdown mode: render complete response
                        process.stdout.write(renderAgentLabel());
                        const rendered = cliModeEnabled
                            ? responseText  // CLI mode: plain text
                            : renderMarkdown(responseText);  // Normal: markdown
                        console.log(rendered.trim());
                    }
                }

                console.log(''); // New line after response
                isProcessing = false;
                currentStreamAbort = null;
            },

            onError: (error) => {
                process.stdout.write('\r\x1b[K'); // Clear line
                console.log(renderError(error));
                isProcessing = false;
                currentStreamAbort = null;
            },
        };

        try {
            const { abort } = await agentService.streamMessage(message, callbacks, {
                conversationId,
                mcpState,
                cliMode: cliModeEnabled ? { enabled: true, streamRaw: rawStreamEnabled } : undefined,
            });
            currentStreamAbort = abort;
        } catch (error) {
            console.log(renderError((error as Error).message));
            isProcessing = false;
        }
    };

    // Start the prompt loop
    promptUser();
}

/**
 * Send a single message (non-interactive mode)
 */
export async function sendMessage(
    message: string,
    options: ChatOptions = {}
): Promise<string> {
    const { mcpState, onMcpToolCall } = options;
    const cliModeEnabled = isCliModeActive(options.cliMode);

    return new Promise((resolve, reject) => {
        let responseText = '';

        const callbacks: AgentStreamCallbacks = {
            onContent: (text, partial) => {
                if (!partial) {
                    responseText = text;
                } else {
                    responseText += text;
                }
            },

            onMcpToolCall: async (callId, serverName, toolName, args) => {
                if (onMcpToolCall) {
                    return onMcpToolCall(callId, serverName, toolName, args);
                }
                return {
                    content: [{ type: 'text' as const, text: 'MCP not available' }],
                    isError: true,
                };
            },

            onDone: () => {
                // Render based on mode
                const rendered = cliModeEnabled
                    ? responseText
                    : renderMarkdown(responseText);
                resolve(rendered.trim());
            },

            onError: (error) => {
                reject(new Error(error));
            },
        };

        agentService.streamMessage(message, callbacks, {
            mcpState,
            cliMode: cliModeEnabled ? { enabled: true } : undefined,
        });
    });
}
