/**
 * Spinner Component
 * Loading indicators for different operation types
 */

import { thinkingSymbol } from '../theme/index.js';

/**
 * Spinner frames for different animation types
 */
const SPINNER_FRAMES = {
    dots: ['⋯', '⋯', '⋰', '⋱'],
    arrows: ['←', '↑', '→', '↓'],
    pipe: ['|', '/', '-', '\\'],
    bounce: ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
    mcp: ['[⚙]', '[⚙⚙]', '[⚙⚙⚙]'],
};

/**
 * Spinner state
 */
interface SpinnerState {
    label: string;
    type: keyof typeof SPINNER_FRAMES;
    frame: number;
    interval: NodeJS.Timeout | null;
    active: boolean;
}

/**
 * Spinner class
 */
export class Spinner {
    private state: SpinnerState = {
        label: '',
        type: 'dots',
        frame: 0,
        interval: null,
        active: false,
    };

    /**
     * Start a spinner
     */
    start(label: string, type: keyof typeof SPINNER_FRAMES = 'dots'): void {
        this.stop(); // Stop any existing spinner

        this.state.label = label;
        this.state.type = type;
        this.state.frame = 0;
        this.state.active = true;

        // Show initial frame
        this.render();

        // Start animation
        this.state.interval = setInterval(() => {
            if (this.state.active) {
                this.state.frame = (this.state.frame + 1) % SPINNER_FRAMES[this.state.type].length;
                this.render();
            }
        }, 100);
    }

    /**
     * Stop the spinner with success or failure message
     */
    stop(message?: string, success = true): void {
        if (!this.state.active) return;

        if (this.state.interval) {
            clearInterval(this.state.interval);
            this.state.interval = null;
        }

        this.state.active = false;

        // Clear the spinner line
        process.stdout.write('\r\x1b[2K'); // Move to start, clear line

        // Show final message
        if (message) {
            const symbol = success ? '✓' : '✗';
            const color = success ? '\x1b[92m' : '\x1b[91m'; // green or red
            process.stdout.write(`${color}${symbol}\x1b[0m ${message}\n`);
        }
    }

    /**
     * Update the spinner label
     */
    update(label: string): void {
        this.state.label = label;
        this.render();
    }

    /**
     * Render current frame
     */
    private render(): void {
        if (!this.state.active) return;

        const frame = SPINNER_FRAMES[this.state.type][this.state.frame];
        process.stdout.write(`\r\x1b[2K${frame} ${this.state.label}`);
    }

    /**
     * Check if spinner is active
     */
    get isActive(): boolean {
        return this.state.active;
    }
}

/**
 * Pre-configured spinner functions
 */

/**
 * Thinking spinner (default for AI processing)
 */
export function thinking(label = 'Thinking...'): Spinner {
    const spinner = new Spinner();
    spinner.start(label, 'dots');
    return spinner;
}

/**
 * Working spinner (for general operations)
 */
export function working(label = 'Working...'): Spinner {
    const spinner = new Spinner();
    spinner.start(label, 'arrows');
    return spinner;
}

/**
 * Loading spinner (for data loading)
 */
export function loading(label = 'Loading...'): Spinner {
    const spinner = new Spinner();
    spinner.start(label, 'bounce');
    return spinner;
}

/**
 * MCP tool spinner
 */
export function mcpSpinner(label = 'MCP Tool...'): Spinner {
    const spinner = new Spinner();
    spinner.start(label, 'mcp');
    return spinner;
}

/**
 * Simple inline text that doesn't animate
 */
export function staticIndicator(text: string, symbol: string = thinkingSymbol()): void {
    process.stdout.write(`\r${symbol} ${text}`);
}
