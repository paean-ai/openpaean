/**
 * Terminal Output Utilities
 * Handles ANSI escape codes for terminal control
 */

/**
 * ANSI escape codes
 */
export const ANSI = {
    // Cursor movement
    saveCursor: '\x1b[s',
    restoreCursor: '\x1b[u',
    moveCursorUp: (n: number) => `\x1b[${n}A`,
    moveCursorDown: (n: number) => `\x1b[${n}B`,
    moveCursorLeft: (n: number) => `\x1b[${n}D`,
    moveCursorRight: (n: number) => `\x1b[${n}C`,
    moveToColumn: (n: number) => `\x1b[${n}G`,
    moveToStart: '\x1b[H',

    // Screen clearing
    clearLine: '\x1b[2K',
    clearScreen: '\x1b[2J',
    clearToEnd: '\x1b[0J',

    // Styles
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    italic: '\x1b[3m',
    underline: '\x1b[4m',

    // Colors (foreground) - keeping for compatibility
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
 * Get terminal width
 */
export function getTerminalWidth(): number {
    return process.stdout.columns || 80;
}

/**
 * Get terminal height
 */
export function getTerminalHeight(): number {
    return process.stdout.rows || 24;
}

/**
 * Apply color to text (only if supported)
 * Note: For semantic colors, use the theme system instead
 */
export function colorize(text: string, ansiCode: string): string {
    if (process.env.NO_COLOR !== undefined || !process.stdout.isTTY) {
        return text;
    }
    return `${ansiCode}${text}${ANSI.reset}`;
}

/**
 * Apply multiple styles
 */
export function style(text: string, ...styles: string[]): string {
    if (process.env.NO_COLOR !== undefined || !process.stdout.isTTY) {
        return text;
    }
    return `${styles.join('')}${text}${ANSI.reset}`;
}

/**
 * Clear current line and move cursor to start
 */
export function clearLine(): void {
    process.stdout.write(ANSI.clearLine + ANSI.moveToColumn(1));
}

/**
 * Clear lines above (for redraw)
 */
export function clearLinesAbove(count: number): void {
    for (let i = 0; i < count; i++) {
        process.stdout.write(ANSI.moveCursorUp(1) + ANSI.clearLine);
    }
}

/**
 * Write a line that doesn't affect the input area
 */
export function writeLine(text: string): void {
    // Save cursor, move to start of line, clear, write, restore
    process.stdout.write(
        ANSI.saveCursor +
        ANSI.clearLine +
        text +
        '\n' +
        ANSI.restoreCursor
    );
}

/**
 * Write text at a specific position
 */
export function writeAt(row: number, col: number, text: string): void {
    process.stdout.write(
        ANSI.moveToStart +
        `\x1b[${row};${col}H` +
        text
    );
}

/**
 * Hide cursor
 */
export function hideCursor(): void {
    process.stdout.write('\x1b[?25l');
}

/**
 * Show cursor
 */
export function showCursor(): void {
    process.stdout.write('\x1b[?25h');
}

/**
 * Enable raw mode (for special key handling)
 */
export function enableRawMode(): void {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }
}

/**
 * Disable raw mode
 */
export function disableRawMode(): void {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
}
