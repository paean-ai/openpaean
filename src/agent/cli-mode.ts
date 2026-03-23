/**
 * CLI Mode Configuration
 * Configures agent behavior for CLI terminal and WeChat gateway contexts.
 * Includes environment awareness so the cloud agent understands it has
 * access to the local machine's filesystem and shell via MCP tools.
 */

import os from 'os';

/**
 * System prompt suffix for CLI mode — formatting only
 */
export const CLI_MODE_PROMPT = `
[CLI Terminal Mode Active]
You are running in a CLI terminal environment. Follow these formatting rules:

OUTPUT FORMAT:
- Do NOT use markdown formatting (no **, *, #, \`\`\`, etc.)
- Use plain text with appropriate spacing and line breaks
- For code snippets, show as-is without code fences
- For lists, use simple dashes (-) or numbers (1. 2. 3.)
- For emphasis, use CAPS or [brackets] sparingly
- Keep output concise and scannable

STRUCTURE:
- Use blank lines to separate sections
- Indent nested content with 2 spaces
- Use --- for horizontal separators if needed
- Keep line width under 80 characters when possible

This ensures optimal display in terminal interfaces.
`;

/**
 * Build the environment-awareness prompt that tells the cloud agent
 * about the local machine it's operating on.
 */
export function buildEnvironmentPrompt(channel?: string): string {
    const cwd = process.cwd();
    const platform = process.platform;
    const hostname = os.hostname();
    const user = os.userInfo().username;
    const home = os.homedir();
    const channelLabel = channel === 'wechat' ? 'WeChat' : channel === 'gateway' ? 'Gateway' : 'CLI';

    return `
[Local Environment — ${channelLabel} Channel]
You are connected to a local OpenPaean CLI agent running on the user's machine.
All MCP tools (paean_execute_shell, paean_list_directory, paean_read_file,
paean_write_file, paean_download_file, etc.) operate DIRECTLY on the local
filesystem and shell of this machine.

Machine context:
- Hostname: ${hostname}
- User: ${user}
- OS: ${platform}
- Home: ${home}
- Working directory: ${cwd}

IMPORTANT rules for tool calls:
- Use ABSOLUTE paths (starting with /) for paean_list_directory, paean_read_file,
  paean_write_file. The dirPath/filePath parameters resolve relative to the working
  directory above, but absolute paths are always preferred to avoid ambiguity.
- For paean_execute_shell, set the cwd parameter if you need to run commands in a
  specific directory.
- paean_list_directory with dirPath set to an absolute path like "/Users/ryan/a8e/scripts"
  will list that exact directory, not the project root.
- You have full access to the local filesystem. Do NOT claim you cannot access local
  files or directories.
`;
}

/**
 * CLI mode options
 */
export interface CliModeOptions {
    /** Enable CLI-friendly output (no markdown) */
    enabled: boolean;
    /** Stream raw text directly without buffering */
    streamRaw: boolean;
    /** Current working directory of the CLI process */
    cwd?: string;
    /** Operating system platform */
    platform?: string;
    /** Hostname */
    hostname?: string;
    /** Channel type: 'cli' | 'wechat' | 'gateway' */
    channel?: string;
}

/**
 * Default CLI mode settings
 */
export const DEFAULT_CLI_MODE: CliModeOptions = {
    enabled: false,
    streamRaw: false,
};

/**
 * Create CLI mode configuration with full environment context
 */
export function createCliModeConfig(options: Partial<CliModeOptions> = {}): CliModeOptions {
    const base: CliModeOptions = {
        ...DEFAULT_CLI_MODE,
        ...options,
    };
    if (base.enabled) {
        base.cwd = base.cwd ?? process.cwd();
        base.platform = base.platform ?? process.platform;
        base.hostname = base.hostname ?? os.hostname();
    }
    return base;
}

/**
 * Check if CLI mode is active based on environment or options
 */
export function isCliModeActive(options?: Partial<CliModeOptions>): boolean {
    if (process.env.PAEAN_CLI_MODE === 'true' || process.env.PAEAN_CLI_MODE === '1') {
        return true;
    }
    return options?.enabled ?? false;
}

/**
 * Check if raw streaming is enabled
 */
export function isRawStreamEnabled(options?: Partial<CliModeOptions>): boolean {
    if (!isCliModeActive(options)) {
        return false;
    }
    if (process.env.PAEAN_RAW_STREAM === 'true' || process.env.PAEAN_RAW_STREAM === '1') {
        return true;
    }
    return options?.streamRaw ?? false;
}
