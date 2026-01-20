/**
 * Status Bar Component
 * Displays helpful hints and status information at the bottom
 */

import { ANSI, colorize, getTerminalWidth, style } from './output.js';
import { primary, warning } from '../theme/index.js';

/**
 * Status bar state
 */
export interface StatusBarState {
    isProcessing: boolean;
    hasInput: boolean;
    mcpToolCount: number;
    isRawMode: boolean;
    isDebugMode: boolean;
}

/**
 * Default status bar state
 */
export const defaultStatusBarState: StatusBarState = {
    isProcessing: false,
    hasInput: false,
    mcpToolCount: 0,
    isRawMode: false,
    isDebugMode: false,
};

/**
 * Status bar key hints
 */
const KEY_HINTS = {
    default: () => primary('[/]') + ' Commands ' +
                  primary('[?]') + ' Help ' +
                  primary('[Tab]') + ' Complete ' +
                  primary('[Ctrl+C]') + ' Exit',

    processing: () => colorize('[Ctrl+C]', ANSI.brightRed) + ' Abort',

    withInput: () => primary('[Tab]') + ' Complete ' +
                   primary('[Ctrl+R]') + ' History ' +
                   primary('[Esc]') + ' Clear',
};

/**
 * Format the status bar content
 */
export function formatStatusBar(state: Partial<StatusBarState> = {}): string {
    const mergedState = { ...defaultStatusBarState, ...state };

    // Choose hints based on state
    let hints: string;
    if (mergedState.isProcessing) {
        hints = KEY_HINTS.processing();
    } else if (mergedState.hasInput) {
        hints = KEY_HINTS.withInput();
    } else {
        hints = KEY_HINTS.default();
    }

    // Build status indicators
    const indicators: string[] = [];

    if (mergedState.mcpToolCount > 0) {
        indicators.push(primary(`🔗 ${mergedState.mcpToolCount} tools`));
    }

    if (mergedState.isRawMode) {
        indicators.push(warning('[RAW]'));
    }

    if (mergedState.isDebugMode) {
        indicators.push(warning('[DEBUG]'));
    }

    // Build full status bar
    const width = getTerminalWidth();
    const leftPart = hints;
    const rightPart = indicators.length > 0 ? ' ' + indicators.join(' ') : '';

    // Calculate padding
    const totalLength = leftPart.length + rightPart.length;
    const padding = Math.max(0, width - totalLength - 2);

    return style(
        leftPart + ' '.repeat(padding) + rightPart,
        ANSI.dim
    );
}

/**
 * Get just the hints part (for input area integration)
 */
export function getStatusHints(state: Partial<StatusBarState> = {}): string {
    const mergedState = { ...defaultStatusBarState, ...state };

    if (mergedState.isProcessing) {
        return colorize('[Ctrl+C] Abort', ANSI.brightRed);
    } else if (mergedState.hasInput) {
        return primary('[Tab]') + ' Complete ' + primary('[Ctrl+R]') + ' History';
    }
    return primary('[/]') + ' Commands ' + primary('[?]') + ' Help';
}
