/**
 * TerminalApp - Scrolling Mode Chat Interface
 * Claude Code style: messages scroll naturally, input fixed at bottom
 */

import readline from 'readline';
import { stdin, stdout } from 'process';
import type { ReadLine } from 'readline';
import { AgentService } from '../../agent/service.js';
import type { McpState, McpToolResult } from '../../agent/types.js';
import {
    ANSI,
    colorize,
    getTerminalWidth,
    showCursor,
} from './output.js';
import { type StatusBarState } from './StatusBar.js';
import {
    primary,
    success,
    error as errorColor,
    warning,
    info,
    muted,
    styledMessage,
    mcpSymbol,
    toolSymbol,
    getLogoAscii,
    getCompactLogo,
    bold
} from '../theme/index.js';

/**
 * Command result type
 */
interface CommandResult {
    handled: boolean;
    output?: string;
    action?: 'exit' | 'clear';
}

/**
 * Message types
 */
export type MessageType = 'user' | 'assistant' | 'system' | 'error' | 'tool';

/**
 * Message interface
 */
export interface Message {
    id: string;
    type: MessageType;
    content: string;
    timestamp: number;
    toolName?: string;
    serverName?: string;
}

/**
 * Available commands for completion
 */
const AVAILABLE_COMMANDS = [
    '/exit',
    '/quit',
    '/q',
    '/clear',
    '/cls',
    '/help',
    '/h',
    '/?',
    '/debug',
    '/raw',
    '/mcp',
];

/**
 * TerminalApp options
 */
export interface TerminalAppOptions {
    mcpState?: McpState;
    onMcpToolCall?: (
        callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ) => Promise<McpToolResult>;
    debug?: boolean;
}

/**
 * TerminalApp class - Scrolling mode chat interface
 */
export class TerminalApp {
    private rl: ReadLine;
    private messages: Message[] = [];
    private isProcessing = false;
    private currentAbort: (() => void) | null = null;
    private statusState: StatusBarState = {
        isProcessing: false,
        hasInput: false,
        mcpToolCount: 0,
        isRawMode: false,
        isDebugMode: false,
    };
    private agentService: AgentService;
    private options: TerminalAppOptions;
    private streamBuffer: string[] = [];
    private currentConversationId: string | null = null;
    private streamingMessageId: string | null = null;

    // MCP tool count
    private get mcpToolCount(): number {
        return this.options.mcpState?.mcpServers?.reduce(
            (sum, s) => sum + (s.tools?.length || 0),
            0
        ) || 0;
    }

    // ... existing properties ...

    /**
     * Handle slash commands
     */
    private handleCommand(input: string): CommandResult {
        const cmd = input.toLowerCase().trim();

        switch (cmd) {
            case '/exit':
            case '/quit':
            case '/q':
                return { handled: true, action: 'exit' };

            case '/clear':
            case '/cls':
                console.clear();
                this.printWelcome();
                return { handled: true, action: 'clear' };

            case '/reset':
            case '/new':
                this.currentConversationId = null;
                this.messages = [];
                console.clear();
                this.printWelcome();
                console.log(success('  Started new conversation context.'));
                return { handled: true, action: 'clear' };

            case '/help':
            case '/h':
            case '/?':
                return {
                    handled: true,
                    output: this.getHelpText(),
                };

            case '/debug':
                this.statusState.isDebugMode = !this.statusState.isDebugMode;
                return {
                    handled: true,
                    output: `Debug mode: ${this.statusState.isDebugMode ? 'ON' : 'OFF'}`,
                };

            case '/raw':
                this.statusState.isRawMode = !this.statusState.isRawMode;
                let output = `Raw mode: ${this.statusState.isRawMode ? 'ON' : 'OFF'}`;
                if (this.statusState.isRawMode) {
                    output += '\nAgent will return plain text (no markdown)';
                }
                return { handled: true, output };

            case '/mcp':
                return { handled: true, output: this.getMcpStatus() };

            default:
                return {
                    handled: true,
                    output: errorColor(`Unknown command: ${cmd}\nType /help for available commands`),
                };
        }
    }

    /**
     * Get help text
     */
    private getHelpText(): string {
        return `
${info('Available Commands:')}

  ${success('/exit, /quit, /q')}    Exit the chat session
  ${success('/clear, /cls')}        Clear the screen
  ${success('/reset, /new')}        Start a new conversation
  ${success('/help, /h, /?')}       Show this help message
  ${success('/debug')}              Toggle debug mode
  ${success('/raw')}                Toggle raw output mode (no markdown)
  ${success('/mcp')}                Show MCP connection status

${info('Shortcuts:')}
  ${warning('Ctrl+C')}             Exit or abort current operation
  ${warning('Ctrl+R')}             Search command history
  ${warning('Tab')}                Command completion

${info('Terminal:')}
  Use your terminal's scroll to view message history.
  All messages remain visible after exit.
`;
    }

    // ... existing methods ...

    /**
     * Process a message through the agent
     */
    private async processMessage(message: string): Promise<void> {
        this.isProcessing = true;
        this.updatePrompt();

        // Create streaming message
        this.streamingMessageId = this.generateId();
        this.streamBuffer = [];

        try {
            const { abort } = await this.agentService.streamMessage(
                message,
                {
                    onContent: (text, partial) => {
                        this.handleStreamContent(text, partial);
                    },
                    onToolCall: (id, name) => {
                        this.handleToolCall(id, name);
                    },
                    onToolResult: (id, name, result) => {
                        this.handleToolResult(id, name, result);
                    },
                    onMcpToolCall: async (callId, serverName, toolName, args) => {
                        return this.handleMcpToolCall(callId, serverName, toolName, args);
                    },
                    onDone: (conversationId) => {
                        this.handleStreamDone(conversationId);
                    },
                    onError: (error) => {
                        this.handleError(error);
                    },
                },
                {
                    conversationId: this.currentConversationId || undefined,
                    mcpState: this.options.mcpState,
                    cliMode: this.statusState.isRawMode ? { enabled: true, streamRaw: true } : undefined,
                }
            );

            this.currentAbort = abort;
        } catch (error) {
            this.handleError((error as Error).message);
        } finally {
            this.isProcessing = false;
            this.currentAbort = null;
            this.streamingMessageId = null;
            this.updatePrompt();
            this.rl.prompt();
        }
    }

    // ... existing methods ...

    /**
     * Handle stream done
     */
    private handleStreamDone(conversationId: string): void {
        // Update current conversation ID to maintain context
        if (conversationId && !this.currentConversationId) {
            this.currentConversationId = conversationId;
            if (this.statusState.isDebugMode) {
                console.log(muted(`[Context set to ${conversationId}]`));
            }
        }
    }
    constructor(options: TerminalAppOptions = {}) {
        this.options = options;
        this.statusState.mcpToolCount = this.mcpToolCount;
        this.statusState.isDebugMode = options.debug ?? false;
        this.agentService = new AgentService();

        // Create readline interface with completer and history
        this.rl = readline.createInterface({
            input: stdin,
            output: stdout,
            prompt: '',
            terminal: true,
            historySize: 1000, // Use readline's built-in history
            completer: this.completer.bind(this),
            removeHistoryDuplicates: true,
        });

        // Setup readline
        this.setupReadline();
    }

    /**
     * Tab completer for commands
     */
    private completer(line: string): [string[], string] {
        // Command completion
        if (line.startsWith('/')) {
            const matches = AVAILABLE_COMMANDS.filter(cmd =>
                cmd.toLowerCase().startsWith(line.toLowerCase())
            );
            return [matches, line];
        }

        // For regular input, let readline handle history completion
        return [[], line];
    }

    /**
     * Setup readline event handlers
     */
    private setupReadline(): void {
        // Handle line input (Enter)
        this.rl.on('line', (input: string) => {
            this.handleInput(input.trim());
        });

        // Handle SIGINT (Ctrl+C)
        this.rl.on('SIGINT', () => {
            if (this.isProcessing) {
                this.abortProcessing();
            } else {
                this.exit();
            }
        });

        // Handle SIGTSTP (Ctrl+Z)
        this.rl.on('SIGTSTP', () => {
            // Ignore - we don't want to suspend
        });

        // Handle close
        this.rl.on('close', () => {
            this.cleanup();
        });
    }

    /**
     * Start the interactive loop
     */
    async start(): Promise<void> {
        // Show welcome message
        this.printWelcome();

        // Show status hints
        this.showStatusHints();

        // Show initial prompt
        this.updatePrompt();

        // Start the readline loop
        this.rl.prompt();
    }

    /**
     * Print welcome message
     */
    private printWelcome(): void {
        const width = getTerminalWidth();
        // Use Paean Blue for the divider
        const line = primary('─'.repeat(Math.min(width, 60)));

        console.log('');
        // Print ASCII Logo
        console.log(primary(getLogoAscii()));

        console.log(line);
        console.log(bold('  Interactive Agent Session'));
        console.log(muted('  Type /help for commands, Ctrl+C to exit'));
        console.log(line);
        console.log('');
    }

    /**
     * Update the prompt with status hints
     */
    private updatePrompt(): void {
        // Paean-styled prompt
        const promptSymbol = this.isProcessing ? '⧖ ' : '◉ ';
        this.rl.setPrompt(primary(promptSymbol));
    }

    /**
     * Get current status hints
     */
    private getStatusHints(): string {
        if (this.isProcessing) {
            return colorize('[Ctrl+C] Abort', ANSI.brightRed);
        }
        return primary('[/]') + ' Commands ' + primary('[?]') + ' Help';
    }

    /**
     * Show status hints below prompt
     */
    private showStatusHints(): void {
        const hints = this.getStatusHints();
        process.stdout.write(`  ${muted(hints)}\n`);
    }

    /**
     * Handle user input
     */
    private async handleInput(input: string): Promise<void> {
        if (input.length === 0) {
            this.rl.prompt();
            return;
        }

        // Check for slash commands
        if (input.startsWith('/')) {
            const result = this.handleCommand(input);
            if (result.handled) {
                if (result.action === 'exit') {
                    this.exit();
                    return;
                }
                if (result.output) {
                    console.log(result.output);
                }
                this.rl.prompt();
                return;
            }
        }

        // Add user message to history
        this.addMessage({
            id: this.generateId(),
            type: 'user',
            content: input,
            timestamp: Date.now(),
        });

        // Process the message (readline already shows the input, no need to echo)
        await this.processMessage(input);
    }



    /**
     * Get MCP status
     */
    private getMcpStatus(): string {
        const servers = this.options.mcpState?.mcpServers || [];

        if (servers.length === 0) {
            return muted('\nNo MCP servers connected\n');
        }

        let status = primary('\nMCP Connections:\n\n');
        for (const server of servers) {
            const toolCount = server.tools?.length || 0;
            status += `  ${success('●')} ${server.name}: ${toolCount} tools\n`;
        }
        return status;
    }



    /**
     * Handle streaming content
     */
    private handleStreamContent(text: string, partial: boolean): void {
        this.streamBuffer.push(text);

        // Only write during streaming (partial=true)
        // Skip the final complete event to avoid duplicate output
        if (partial) {
            // First chunk - write prefix
            if (this.streamBuffer.length === 1) {
                // Use compact logo or just "Paean" in brand color
                process.stdout.write('\n' + getCompactLogo() + ': ');
            }
            // Write the content chunk
            process.stdout.write(text);
        } else {
            // Stream complete - just add to messages, don't write again
            this.addMessage({
                id: this.streamingMessageId || this.generateId(),
                type: 'assistant',
                content: this.streamBuffer.join(''),
                timestamp: Date.now(),
            });
            // Write final newlines
            process.stdout.write('\n\n');
            this.streamBuffer = [];
        }
    }

    /**
     * Handle tool call
     */
    private handleToolCall(_id: string, name: string): void {
        // Newline before tool indicator
        process.stdout.write(`\n${toolSymbol()} ${name}...`);
    }

    /**
     * Handle tool result
     */
    private handleToolResult(_id: string, _name: string, result: any): void {
        if (result.isError) {
            process.stdout.write(' ' + errorColor('✗') + '\n');
        } else {
            process.stdout.write(' ' + success('✓') + '\n');
        }
    }

    /**
     * Handle MCP tool call
     */
    private async handleMcpToolCall(
        callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ): Promise<McpToolResult> {
        if (!this.options.onMcpToolCall) {
            return {
                content: [{ type: 'text', text: 'MCP not available' }],
                isError: true,
            };
        }

        // Newline before MCP tool indicator
        process.stdout.write(`\n${mcpSymbol()} [${serverName}] ${toolName}...`);

        try {
            const result = await this.options.onMcpToolCall(callId, serverName, toolName, args);
            if (result.isError) {
                process.stdout.write(' ' + errorColor('✗') + '\n');
            } else {
                process.stdout.write(' ' + success('✓') + '\n');
            }
            return result;
        } catch (err) {
            process.stdout.write(' ' + errorColor('✗') + '\n');
            return {
                content: [{ type: 'text', text: (err as Error).message }],
                isError: true,
            };
        }
    }



    /**
     * Handle error
     */
    private handleError(error: string): void {
        console.log(styledMessage('error', `Error: ${error}\n`));
        this.addMessage({
            id: this.generateId(),
            type: 'error',
            content: error,
            timestamp: Date.now(),
        });
    }

    /**
     * Abort current processing
     */
    private abortProcessing(): void {
        if (this.currentAbort) {
            this.currentAbort();
            this.currentAbort = null;
            console.log(warning('\n⚠ Aborted\n'));
        }
        this.isProcessing = false;
        this.streamingMessageId = null;
        this.updatePrompt();
    }

    /**
     * Add a message to history
     */
    private addMessage(message: Message): void {
        this.messages.push(message);
    }

    /**
     * Generate unique ID
     */
    private generateId(): string {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Exit the application
     */
    exit(): void {
        console.log(bold(primary('\n👋 Goodbye!\n')));
        this.cleanup();
        process.exit(0);
    }

    /**
     * Cleanup resources
     */
    private cleanup(): void {
        this.rl.close();
        showCursor();
    }
}
