/**
 * Markdown Renderer for CLI
 * Beautiful terminal markdown rendering using marked + marked-terminal
 */

import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

// Configure marked with terminal renderer
const marked = new Marked();
marked.use(
    markedTerminal({
        // Code blocks
        code: chalk.bgGray.white,
        blockquote: chalk.gray.italic,
        // Headers
        heading: chalk.bold.cyan,
        firstHeading: chalk.bold.magenta,
        // Text styles
        strong: chalk.bold,
        em: chalk.italic,
        del: chalk.strikethrough.gray,
        // Links and references
        link: chalk.blue.underline,
        href: chalk.blue.underline,
        // Lists
        listitem: chalk.reset,
        // Code highlighting
        codespan: chalk.yellow,
        // Misc
        unescape: true,
        emoji: true,
        width: process.stdout.columns || 80,
        showSectionPrefix: false,
        reflowText: true,
        tab: 2,
    })
);

/**
 * Render markdown text to styled terminal output
 */
export function renderMarkdown(text: string): string {
    try {
        const result = marked.parse(text);
        // Handle both sync and async results (marked can return a promise)
        if (typeof result === 'string') {
            return result;
        }
        // If it's a promise, we'll handle it synchronously for now
        return text;
    } catch {
        // Fallback to plain text on error
        return text;
    }
}

/**
 * Render a tool call indicator
 */
export function renderToolCall(name: string): string {
    return chalk.dim(`🔧 Using tool: ${chalk.cyan(name)}...`);
}

/**
 * Render a tool result indicator
 */
export function renderToolResult(name: string, success: boolean = true): string {
    const icon = success ? chalk.green('✓') : chalk.red('✗');
    return chalk.dim(`${icon} Tool ${chalk.cyan(name)} completed`);
}

/**
 * Render MCP tool call indicator
 */
export function renderMcpToolCall(
    serverName: string,
    toolName: string
): string {
    return chalk.dim(
        `🔗 MCP: ${chalk.yellow(serverName)} → ${chalk.cyan(toolName)}...`
    );
}

/**
 * Render MCP tool result indicator
 */
export function renderMcpToolResult(
    serverName: string,
    toolName: string,
    success: boolean = true
): string {
    const icon = success ? chalk.green('✓') : chalk.red('✗');
    return chalk.dim(
        `${icon} MCP: ${chalk.yellow(serverName)} → ${chalk.cyan(toolName)} completed`
    );
}

/**
 * Render an error message
 */
export function renderError(message: string): string {
    return chalk.red(`\n❌ Error: ${message}\n`);
}

/**
 * Render a success message
 */
export function renderSuccess(message: string): string {
    return chalk.green(`✓ ${message}`);
}

/**
 * Render the agent prompt
 */
export function renderPrompt(): string {
    return chalk.bold.blue('You: ');
}

/**
 * Render the agent label
 */
export function renderAgentLabel(): string {
    return chalk.bold.magenta('Pæan: ');
}

/**
 * Render welcome message
 */
export function renderWelcome(mcpToolCount?: number): string {
    const lines: string[] = [
        '',
        chalk.bold.cyan('╭─────────────────────────────────────────╮'),
        chalk.bold.cyan('│') + chalk.bold.white('        Pæan AI Agent Mode              ') + chalk.bold.cyan('│'),
        chalk.bold.cyan('╰─────────────────────────────────────────╯'),
        '',
    ];

    if (mcpToolCount !== undefined && mcpToolCount > 0) {
        lines.push(
            chalk.dim(`  🔗 MCP: ${chalk.green(mcpToolCount)} tools connected`)
        );
    }

    lines.push(
        chalk.dim('  Type your message and press Enter to send.'),
        chalk.dim('  Press Ctrl+C to exit.'),
        ''
    );

    return lines.join('\n');
}

/**
 * Render goodbye message
 */
export function renderGoodbye(): string {
    return chalk.dim('\n👋 Goodbye!\n');
}

/**
 * Render thinking indicator
 */
export function renderThinking(): string {
    return chalk.dim('💭 Thinking...');
}
