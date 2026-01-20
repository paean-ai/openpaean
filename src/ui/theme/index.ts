/**
 * Theme configuration
 * Centralized styling for the CLI
 */

import chalk from 'chalk';
import { BRAND_COLORS } from './branding.js';

// Re-export specific brand colors for usage
export const PAEAN_BLUE = BRAND_COLORS.primary;

// Styled functions using Chalk
export const primary = chalk.hex(BRAND_COLORS.primary);
export const primaryBold = chalk.hex(BRAND_COLORS.primary).bold;
export const secondary = chalk.hex(BRAND_COLORS.secondary);
export const success = chalk.hex(BRAND_COLORS.success);
export const warning = chalk.hex(BRAND_COLORS.warning);
export const error = chalk.hex(BRAND_COLORS.error);
export const dummy = chalk.gray; // Placeholder
export const muted = chalk.hex(BRAND_COLORS.muted);
export const dim = chalk.dim;
export const bold = chalk.bold;
export const italic = chalk.italic;

// Component styles
export const link = chalk.underline.hex(BRAND_COLORS.primaryLight);
export const code = chalk.bgHex('#1e1e1e').hex('#d4d4d4');
export const highlight = chalk.bgHex(BRAND_COLORS.primary).black;

// Status indicators
export const symbols = {
    info: primary('ℹ'),
    success: success('✔'),
    warning: warning('⚠'),
    error: error('✖'),
    arrow: primary('➜'),
    bullet: muted('•'),
    pointer: primary('❯'),
    checkboxOn: success('◉'),
    checkboxOff: muted('○'),
};

// Application specific symbols
export const mcpSymbol = () => chalk.hex('#f59e0b')('⚡'); // Amber lightning for tools/MCP
export const toolSymbol = () => chalk.hex('#8b5cf6')('🔧'); // Violet wrench for tools

/**
 * Format a styled message block
 */
export function styledMessage(type: 'info' | 'success' | 'warning' | 'error', text: string): string {
    const symbol = symbols[type];
    return `${symbol} ${text}`;
}

// Export branding assets
export { getLogoAscii, getCompactLogo } from './branding.js';
export { BRAND_COLORS };

// Additional styles
export const info = chalk.hex(BRAND_COLORS.primaryLight);
