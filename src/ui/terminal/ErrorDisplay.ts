/**
 * Error Display
 * Structured error messages with cause and suggestions
 */

import { styledMessage, warning, info, muted } from '../theme/index.js';

/**
 * Error detail structure
 */
export interface ErrorDetail {
    message: string;
    cause?: string;
    suggestion?: string;
    code?: string;
}

/**
 * Format an error for display
 */
export function formatError(detail: ErrorDetail): string {
    let output = '';

    // Main error message
    output += styledMessage('error', detail.message) + '\n';

    // Error code if present
    if (detail.code) {
        output += muted(`  Code: ${detail.code}\n`);
    }

    // Cause
    if (detail.cause) {
        output += `  ${warning('Cause:')} ${detail.cause}\n`;
    }

    // Suggestion
    if (detail.suggestion) {
        output += `  ${info('Suggestion:')} ${detail.suggestion}\n`;
    }

    return output;
}

/**
 * Display an error and return the formatted string
 */
export function displayError(detail: ErrorDetail): string {
    return formatError(detail);
}

/**
 * Common error templates
 */
export const Errors = {
    /**
     * Network error
     */
    network: (cause?: string): ErrorDetail => ({
        message: 'Network connection failed',
        cause: cause || 'Could not reach the server',
        suggestion: 'Check your internet connection and try again',
    }),

    /**
     * Authentication error
     */
    auth: (): ErrorDetail => ({
        message: 'Authentication failed',
        cause: 'Your session may have expired',
        suggestion: 'Run `openpaean login` to re-authenticate',
    }),

    /**
     * MCP connection error
     */
    mcpConnection: (serverName: string, cause?: string): ErrorDetail => ({
        message: `Failed to connect to MCP server "${serverName}"`,
        cause: cause || 'Server may be unavailable or already in use',
        suggestion: 'Check if the server is running and not used by another client',
    }),

    /**
     * MCP tool error
     */
    mcpTool: (toolName: string, cause?: string): ErrorDetail => ({
        message: `MCP tool "${toolName}" failed`,
        cause: cause || 'Tool execution returned an error',
        suggestion: 'Check the tool configuration and try again',
    }),

    /**
     * File not found
     */
    fileNotFound: (path: string): ErrorDetail => ({
        message: `File not found: ${path}`,
        suggestion: 'Check the file path and try again',
    }),

    /**
     * Invalid input
     */
    invalidInput: (field?: string): ErrorDetail => ({
        message: field ? `Invalid ${field}` : 'Invalid input',
        suggestion: 'Please check your input and try again',
    }),

    /**
     * Generic error
     */
    generic: (message: string, suggestion?: string): ErrorDetail => ({
        message,
        suggestion,
    }),
};

/**
 * Parse an Error object into ErrorDetail
 */
export function parseError(err: unknown): ErrorDetail {
    if (err instanceof Error) {
        return {
            message: err.message,
            cause: err.cause as string | undefined,
        };
    }

    if (typeof err === 'string') {
        return { message: err };
    }

    return { message: 'An unknown error occurred' };
}

/**
 * Display error from caught exception
 */
export function showError(err: unknown): string {
    const detail = parseError(err);
    return displayError(detail);
}
