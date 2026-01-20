/**
 * CLI Mode Configuration
 * Configures agent to return CLI-friendly output without markdown
 */

/**
 * System prompt suffix for CLI mode
 * Instructs the agent to return plain text instead of markdown
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
 * CLI mode options
 */
export interface CliModeOptions {
    /** Enable CLI-friendly output (no markdown) */
    enabled: boolean;
    /** Stream raw text directly without buffering */
    streamRaw: boolean;
}

/**
 * Default CLI mode settings
 */
export const DEFAULT_CLI_MODE: CliModeOptions = {
    enabled: false,
    streamRaw: false,
};

/**
 * Create CLI mode configuration for API requests
 */
export function createCliModeConfig(options: Partial<CliModeOptions> = {}): CliModeOptions {
    return {
        ...DEFAULT_CLI_MODE,
        ...options,
    };
}

/**
 * Check if CLI mode is active based on environment or options
 */
export function isCliModeActive(options?: Partial<CliModeOptions>): boolean {
    // Check environment variable
    if (process.env.PAEAN_CLI_MODE === 'true' || process.env.PAEAN_CLI_MODE === '1') {
        return true;
    }

    // Check explicit option
    return options?.enabled ?? false;
}

/**
 * Check if raw streaming is enabled
 */
export function isRawStreamEnabled(options?: Partial<CliModeOptions>): boolean {
    if (!isCliModeActive(options)) {
        return false;
    }

    // Check environment variable
    if (process.env.PAEAN_RAW_STREAM === 'true' || process.env.PAEAN_RAW_STREAM === '1') {
        return true;
    }

    return options?.streamRaw ?? false;
}
