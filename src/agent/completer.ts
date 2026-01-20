/**
 * Command Completer for CLI
 * Provides tab completion for slash commands
 */

import chalk from 'chalk';

/**
 * Command definition
 */
export interface CommandDef {
    name: string;
    description: string;
    aliases?: string[];
}

/**
 * Available slash commands
 */
export const COMMANDS: CommandDef[] = [
    { name: '/exit', description: 'Exit the chat session', aliases: ['/quit', '/q'] },
    { name: '/quit', description: 'Exit the chat session' },
    { name: '/clear', description: 'Clear the screen', aliases: ['/cls'] },
    { name: '/help', description: 'Show available commands', aliases: ['/h', '/?'] },
    { name: '/model', description: 'Switch AI model' },
    { name: '/debug', description: 'Toggle debug mode' },
    { name: '/mcp', description: 'Show MCP connection status' },
    { name: '/history', description: 'Show conversation history' },
    { name: '/export', description: 'Export conversation to file' },
    { name: '/raw', description: 'Toggle raw output mode (no markdown)' },
];

/**
 * Get all command names (including aliases)
 */
export function getAllCommandNames(): string[] {
    const names: string[] = [];
    for (const cmd of COMMANDS) {
        names.push(cmd.name);
        if (cmd.aliases) {
            names.push(...cmd.aliases);
        }
    }
    return names;
}

/**
 * Readline completer function for slash commands
 * @param line Current input line
 * @returns [completions, substring] tuple for readline
 */
export function commandCompleter(line: string): [string[], string] {
    // Only complete if line starts with /
    if (!line.startsWith('/')) {
        return [[], line];
    }

    const allNames = getAllCommandNames();
    const matches = allNames.filter(name => name.startsWith(line.toLowerCase()));

    // If exact match exists, return it
    if (matches.length === 1) {
        return [matches, line];
    }

    // If multiple matches or no matches, show all matching commands
    if (matches.length > 0) {
        return [matches, line];
    }

    // No matches - show all commands
    return [COMMANDS.map(c => c.name), line];
}

/**
 * Render command help as formatted string
 */
export function renderCommandHelp(): string {
    const lines: string[] = [
        '',
        chalk.bold.cyan('  Available Commands:'),
        '',
    ];

    for (const cmd of COMMANDS) {
        const aliases = cmd.aliases?.length
            ? chalk.dim(` (${cmd.aliases.join(', ')})`)
            : '';
        lines.push(
            `    ${chalk.yellow(cmd.name.padEnd(12))} ${chalk.dim(cmd.description)}${aliases}`
        );
    }

    lines.push('');
    lines.push(chalk.dim('  Press Tab after / to autocomplete commands'));
    lines.push('');

    return lines.join('\n');
}

/**
 * Check if input is a known command
 */
export function isCommand(input: string): boolean {
    const normalized = input.toLowerCase().trim();
    return getAllCommandNames().includes(normalized);
}

/**
 * Get command definition by name (including alias lookup)
 */
export function getCommandDef(input: string): CommandDef | undefined {
    const normalized = input.toLowerCase().trim();

    // Direct match
    const direct = COMMANDS.find(c => c.name === normalized);
    if (direct) return direct;

    // Alias match
    for (const cmd of COMMANDS) {
        if (cmd.aliases?.includes(normalized)) {
            return cmd;
        }
    }

    return undefined;
}
