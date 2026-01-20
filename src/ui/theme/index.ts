/**
 * Color Theme System
 * Unified semantic color definitions with NO_COLOR support
 */

/**
 * Check if colors are supported
 */
export function supportsColor(): boolean {
    return process.env.NO_COLOR === undefined &&
        process.stdout.isTTY &&
        process.env.TERM !== 'dumb';
}

/**
 * ANSI color codes
 */
const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    brightBlack: '\x1b[90m',
    brightRed: '\x1b[91m',
    brightGreen: '\x1b[92m',
    brightYellow: '\x1b[93m',
    brightBlue: '\x1b[94m',
    brightMagenta: '\x1b[95m',
    brightCyan: '\x1b[96m',
    brightWhite: '\x1b[97m',
};

/**
 * Semantic color definitions
 */
export const COLORS = {
    // Status colors with semantic meaning
    success: {
        code: ANSI.brightGreen,
        symbol: '✓',
    },
    error: {
        code: ANSI.brightRed,
        symbol: '✗',
    },
    warning: {
        code: ANSI.brightYellow,
        symbol: '⚠',
    },
    info: {
        code: ANSI.brightCyan,
        symbol: 'ℹ',
    },

    // Brand colors
    primary: {
        code: ANSI.brightMagenta,  // AI brand color
        symbol: '◆',
    },
    secondary: {
        code: ANSI.brightBlue,     // Accent color
        symbol: '◇',
    },

    // Text colors
    text: {
        code: ANSI.white,
    },
    textDim: {
        code: ANSI.brightBlack,
    },

    // Special indicators
    mcp: {
        code: ANSI.brightMagenta,
        symbol: '🔗',
    },
    tool: {
        code: ANSI.brightYellow,
        symbol: '⚙',
    },
    thinking: {
        code: ANSI.brightCyan,
        symbol: '⋯',
    },
};

/**
 * Color utility functions
 */

/**
 * Apply a color code to text (only if colors are supported)
 */
export function colorize(text: string, colorCode: string): string {
    if (!supportsColor()) {
        return text;
    }
    return `${colorCode}${text}${ANSI.reset}`;
}

/**
 * Apply bold style
 */
export function bold(text: string): string {
    if (!supportsColor()) {
        return text;
    }
    return `${ANSI.bold}${text}${ANSI.reset}`;
}

/**
 * Apply dim style
 */
export function dim(text: string): string {
    if (!supportsColor()) {
        return text;
    }
    return `${ANSI.dim}${text}${ANSI.reset}`;
}

/**
 * Semantic color functions
 */

/**
 * Style text as success
 */
export function success(text: string): string {
    return colorize(text, COLORS.success.code);
}

/**
 * Style text as error
 */
export function error(text: string): string {
    return colorize(text, COLORS.error.code);
}

/**
 * Style text as warning
 */
export function warning(text: string): string {
    return colorize(text, COLORS.warning.code);
}

/**
 * Style text as info
 */
export function info(text: string): string {
    return colorize(text, COLORS.info.code);
}

/**
 * Style text as primary (brand)
 */
export function primary(text: string): string {
    return colorize(text, COLORS.primary.code);
}

/**
 * Style text as secondary (accent)
 */
export function secondary(text: string): string {
    return colorize(text, COLORS.secondary.code);
}

/**
 * Style text as dim
 */
export function muted(text: string): string {
    return dim(text);
}

/**
 * Get success symbol (with or without color)
 */
export function successSymbol(): string {
    return colorize(COLORS.success.symbol, COLORS.success.code);
}

/**
 * Get error symbol (with or without color)
 */
export function errorSymbol(): string {
    return colorize(COLORS.error.symbol, COLORS.error.code);
}

/**
 * Get warning symbol (with or without color)
 */
export function warningSymbol(): string {
    return colorize(COLORS.warning.symbol, COLORS.warning.code);
}

/**
 * Get info symbol (with or without color)
 */
export function infoSymbol(): string {
    return colorize(COLORS.info.symbol, COLORS.info.code);
}

/**
 * Get MCP tool symbol
 */
export function mcpSymbol(): string {
    return colorize(COLORS.mcp.symbol, COLORS.mcp.code);
}

/**
 * Get tool symbol
 */
export function toolSymbol(): string {
    return colorize(COLORS.tool.symbol, COLORS.tool.code);
}

/**
 * Get thinking symbol
 */
export function thinkingSymbol(): string {
    return colorize(COLORS.thinking.symbol, COLORS.thinking.code);
}

/**
 * Create a styled message with dual encoding (color + symbol)
 */
export function styledMessage(
    type: 'success' | 'error' | 'warning' | 'info',
    message: string
): string {
    const color = COLORS[type];
    return colorize(`${color.symbol} ${message}`, color.code);
}

/**
 * Export theme as object for convenience
 */
export const theme = {
    colorize,
    bold,
    dim,
    success,
    error,
    warning,
    info,
    primary,
    secondary,
    muted,
    successSymbol,
    errorSymbol,
    warningSymbol,
    infoSymbol,
    mcpSymbol,
    toolSymbol,
    thinkingSymbol,
    styledMessage,
};
