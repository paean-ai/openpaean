/**
 * Dynamic Spinner Controller
 * Beautiful loading animations inspired by Claude Code and Codex
 */

import ora from 'ora';
import chalk from 'chalk';

/**
 * Gradient colors for breathing effect
 */
const GRADIENT_COLORS = [
    '#9D4EDD', // Purple
    '#7B2CBF', // Deep purple
    '#5A189A', // Violet
    '#3C096C', // Dark violet
    '#5A189A', // Back up
    '#7B2CBF',
    '#9D4EDD',
    '#C77DFF', // Light purple
    '#E0AAFF', // Lavender
    '#C77DFF',
];

/**
 * Custom spinner frames with wave effect
 */
const WAVE_FRAMES = [
    '⠋',
    '⠙',
    '⠹',
    '⠸',
    '⠼',
    '⠴',
    '⠦',
    '⠧',
    '⠇',
    '⠏',
];

const PULSE_FRAMES = [
    '●∙∙∙∙',
    '∙●∙∙∙',
    '∙∙●∙∙',
    '∙∙∙●∙',
    '∙∙∙∙●',
    '∙∙∙●∙',
    '∙∙●∙∙',
    '∙●∙∙∙',
];

const RIPPLE_FRAMES = [
    '◜ ',
    ' ◝',
    ' ◞',
    '◟ ',
];

/**
 * Spinner controller interface
 */
export interface SpinnerController {
    start: () => void;
    stop: () => void;
    clear: () => void;
    text: (message: string) => void;
    success: (message?: string) => void;
    fail: (message?: string) => void;
    isSpinning: () => boolean;
}

/**
 * Spinner type enum
 */
export type SpinnerType = 'thinking' | 'tool' | 'mcp' | 'loading';

/**
 * Create a thinking spinner with gradient animation
 */
export function createThinkingSpinner(): SpinnerController {
    let colorIdx = 0;

    const spinner = ora({
        text: chalk.dim('Thinking...'),
        spinner: {
            interval: 80,
            frames: WAVE_FRAMES,
        },
        color: 'magenta',
    });

    // Gradient color cycling
    let intervalId: ReturnType<typeof setInterval> | null = null;

    return {
        start: () => {
            spinner.start();
            // Cycle through gradient colors
            intervalId = setInterval(() => {
                colorIdx = (colorIdx + 1) % GRADIENT_COLORS.length;
                spinner.color = 'magenta'; // ora doesn't support hex, keep magenta
                spinner.text = chalk.hex(GRADIENT_COLORS[colorIdx])('💭 Thinking...');
            }, 150);
        },
        stop: () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            spinner.stop();
        },
        clear: () => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            spinner.stop();
            // Clear the line
            process.stdout.write('\r\x1b[K');
        },
        text: (message: string) => {
            spinner.text = chalk.hex(GRADIENT_COLORS[colorIdx])(message);
        },
        success: (message?: string) => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            spinner.succeed(message);
        },
        fail: (message?: string) => {
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            spinner.fail(message);
        },
        isSpinning: () => spinner.isSpinning,
    };
}

/**
 * Create a tool call spinner with pulse animation
 */
export function createToolCallSpinner(toolName: string): SpinnerController {
    const spinner = ora({
        text: chalk.dim(`🔧 ${chalk.cyan(toolName)}...`),
        spinner: {
            interval: 100,
            frames: PULSE_FRAMES,
        },
        color: 'cyan',
    });

    return {
        start: () => spinner.start(),
        stop: () => spinner.stop(),
        clear: () => {
            spinner.stop();
            process.stdout.write('\r\x1b[K');
        },
        text: (message: string) => {
            spinner.text = chalk.dim(`🔧 ${chalk.cyan(message)}...`);
        },
        success: (_message?: string) => {
            spinner.succeed(chalk.dim(`${chalk.green('✓')} Tool ${chalk.cyan(toolName)} completed`));
        },
        fail: (message?: string) => {
            spinner.fail(chalk.dim(`${chalk.red('✗')} Tool ${chalk.cyan(toolName)} failed${message ? `: ${message}` : ''}`));
        },
        isSpinning: () => spinner.isSpinning,
    };
}

/**
 * Create an MCP tool call spinner with ripple animation
 */
export function createMcpSpinner(serverName: string, toolName: string): SpinnerController {
    const spinner = ora({
        text: chalk.dim(`🔗 ${chalk.yellow(serverName)} → ${chalk.cyan(toolName)}...`),
        spinner: {
            interval: 120,
            frames: RIPPLE_FRAMES,
        },
        color: 'yellow',
    });

    return {
        start: () => spinner.start(),
        stop: () => spinner.stop(),
        clear: () => {
            spinner.stop();
            process.stdout.write('\r\x1b[K');
        },
        text: (message: string) => {
            spinner.text = message;
        },
        success: (_message?: string) => {
            spinner.succeed(
                chalk.dim(`${chalk.green('✓')} MCP: ${chalk.yellow(serverName)} → ${chalk.cyan(toolName)} completed`)
            );
        },
        fail: (message?: string) => {
            spinner.fail(
                chalk.dim(`${chalk.red('✗')} MCP: ${chalk.yellow(serverName)} → ${chalk.cyan(toolName)} failed${message ? `: ${message}` : ''}`)
            );
        },
        isSpinning: () => spinner.isSpinning,
    };
}

/**
 * Create a generic loading spinner
 */
export function createLoadingSpinner(message: string = 'Loading...'): SpinnerController {
    const spinner = ora({
        text: chalk.dim(message),
        spinner: 'dots',
        color: 'blue',
    });

    return {
        start: () => spinner.start(),
        stop: () => spinner.stop(),
        clear: () => {
            spinner.stop();
            process.stdout.write('\r\x1b[K');
        },
        text: (msg: string) => {
            spinner.text = chalk.dim(msg);
        },
        success: (msg?: string) => spinner.succeed(msg),
        fail: (msg?: string) => spinner.fail(msg),
        isSpinning: () => spinner.isSpinning,
    };
}
