/**
 * Interactive Chat Loop - Ink Version
 * Modern React-based CLI interface using Ink
 * Supports both inline and fullscreen modes
 */

import { render } from 'ink';
import { App } from '../ui/App.js';
import { FullscreenApp } from '../ui/FullscreenApp.js';
import type { McpState, McpToolResult } from './types.js';

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
}

/**
 * Enter alternate screen buffer for fullscreen mode
 */
function enterAlternateScreen(): void {
    process.stdout.write('\x1b[?1049h'); // Enter alternate screen
    process.stdout.write('\x1b[H');      // Move cursor to top-left
    process.stdout.write('\x1b[2J');     // Clear screen
}

/**
 * Exit alternate screen buffer
 */
function exitAlternateScreen(): void {
    process.stdout.write('\x1b[?1049l'); // Exit alternate screen
}

/**
 * Start the interactive chat loop using Ink (inline mode)
 */
export async function startChat(options: ChatOptions = {}): Promise<void> {
    const { mcpState, onMcpToolCall, debug } = options;

    // Render the Ink application
    const { waitUntilExit } = render(
        <App
            mcpState={mcpState}
            onMcpToolCall={onMcpToolCall}
            debug={debug}
        />
    );

    // Wait until the app exits
    await waitUntilExit();
}

/**
 * Start the interactive chat loop in fullscreen mode
 */
export async function startFullscreenChat(options: ChatOptions = {}): Promise<void> {
    const { mcpState, onMcpToolCall, debug } = options;

    // Enter alternate screen buffer
    enterAlternateScreen();

    try {
        // Render the fullscreen Ink application
        const { waitUntilExit } = render(
            <FullscreenApp
                mcpState={mcpState}
                onMcpToolCall={onMcpToolCall}
                debug={debug}
            />
        );

        // Wait until the app exits
        await waitUntilExit();
    } finally {
        // Always exit alternate screen on cleanup
        exitAlternateScreen();
    }
}

/**
 * Start the chat in scrolling mode (new default - Claude Code style)
 * Messages scroll naturally, input fixed at bottom, no alternate screen
 */
export async function startScrollingChat(options: ChatOptions = {}): Promise<void> {
    const { TerminalApp } = await import('../ui/terminal/TerminalApp.js');

    const app = new TerminalApp(options);
    await app.start();
}

/**
 * Send a single message (non-interactive mode)
 * This is kept for programmatic usage
 */
export { sendMessage } from './chat.legacy.js';
