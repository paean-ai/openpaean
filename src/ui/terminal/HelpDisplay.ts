/**
 * Help Display
 * Centralized help content for the CLI
 */

import { success, info, warning, primary, muted } from '../theme/index.js';

/**
 * Get full help text
 */
export function getFullHelp(): string {
    return `
${info('Available Commands:')}

  ${success('/exit, /quit, /q')}    Exit the chat session
  ${success('/clear, /cls')}        Clear the screen
  ${success('/help, /h, /?')}       Show this help message
  ${success('/debug')}              Toggle debug mode
  ${success('/raw')}                Toggle raw output mode (no markdown)
  ${success('/mcp')}                Show MCP connection status

${info('Keyboard Shortcuts:')}

  ${warning('Ctrl+C')}             Exit or abort current operation
  ${warning('Ctrl+D')}             Exit (alternative)
  ${warning('Tab')}                Command completion
  ${warning('↑/↓')}                Navigate command history
  ${warning('Ctrl+L')}             Clear screen

${info('Chat Features:')}

  ${primary('MCP Tools')}           Local tool calling via Model Context Protocol
  ${primary('Streaming')}           Real-time response streaming
  ${primary('Markdown')}            Rich formatted responses (unless in raw mode)

${info('Modes:')}

  ${success('Raw Mode')}            Disable markdown formatting for plain text output
  ${success('Debug Mode')}          Show detailed logging for troubleshooting

${info('Terminal:')}

  Use your terminal's scroll to view message history.
  All messages remain visible after exit.

${muted('For more information, visit: https://github.com/paean-ai/openpaean')}
`;
}

/**
 * Get quick help (one-line hints)
 */
export function getQuickHelp(): string {
    return `${primary('[/]')} Commands ${primary('[?]')} Help ${primary('[Tab]')} Complete ${primary('[Ctrl+C]')} Exit`;
}

/**
 * Get command-specific help
 */
export function getCommandHelp(command: string): string | null {
    const commands: Record<string, string> = {
        '/exit': 'Exit the chat session',
        '/quit': 'Exit the chat session (alias for /exit)',
        '/q': 'Exit the chat session (short alias)',
        '/clear': 'Clear the screen',
        '/cls': 'Clear the screen (alias)',
        '/help': 'Show this help message',
        '/debug': 'Toggle debug mode for detailed logging',
        '/raw': 'Toggle raw mode (plain text output, no markdown)',
        '/mcp': 'Show MCP server connection status and available tools',
    };

    return commands[command.toLowerCase()] || null;
}

/**
 * Get keybinding help table
 */
export function getKeyBindings(): string {
    const bindings = [
        { key: 'Ctrl+C', action: 'Exit / Abort' },
        { key: 'Ctrl+D', action: 'Exit' },
        { key: 'Ctrl+L', action: 'Clear screen' },
        { key: 'Tab', action: 'Complete command' },
        { key: '↑ / ↓', action: 'History navigation' },
        { key: 'Enter', action: 'Send message' },
        { key: '?', action: 'Show keybindings' },
    ];

    let output = '\n' + info('Keybindings:') + '\n\n';
    for (const binding of bindings) {
        output += `  ${warning(binding.key.padEnd(12))} ${binding.action}\n`;
    }
    return output;
}
