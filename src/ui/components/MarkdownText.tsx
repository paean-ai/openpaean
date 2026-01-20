/**
 * MarkdownText Component
 * Renders markdown text with terminal-friendly formatting
 * Uses marked + marked-terminal for rich rendering
 */

import React, { useMemo } from 'react';
import { Box, Text, Transform } from 'ink';
import { Marked } from 'marked';
import { markedTerminal } from 'marked-terminal';
import chalk from 'chalk';

interface MarkdownTextProps {
    children: string;
    /** Whether to show as streaming (with cursor) */
    streaming?: boolean;
    /** Terminal width for text wrapping */
    width?: number;
}

// Create a configured marked instance
function createMarkedInstance(width: number) {
    const marked = new Marked();
    marked.use(
        markedTerminal({
            // Code blocks - prominent background
            code: (code: string) => {
                const lines = code.split('\n');
                const maxLen = Math.max(...lines.map(l => l.length));
                const paddedLines = lines.map(l => ` ${l.padEnd(maxLen)} `);
                return chalk.bgGray.white('\n' + paddedLines.join('\n') + '\n');
            },
            // Inline code
            codespan: chalk.bgGray.yellow,
            // Blockquote - gray with left border
            blockquote: chalk.gray.italic,
            // Headers - colored and bold
            heading: chalk.bold.cyan,
            firstHeading: chalk.bold.magenta.underline,
            // Text styles
            strong: chalk.bold,
            em: chalk.italic,
            del: chalk.strikethrough.dim,
            // Links
            link: chalk.blue.underline,
            href: chalk.dim.blue,
            // Lists
            listitem: chalk.reset,
            list: chalk.reset,
            // Table
            table: chalk.reset,
            // Misc
            unescape: true,
            emoji: true,
            width: width,
            showSectionPrefix: false,
            reflowText: true,
            tab: 2,
        })
    );
    return marked;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({
    children,
    streaming = false,
    width = 80,
}) => {
    // Memoize the rendered markdown
    const renderedText = useMemo(() => {
        if (!children || children.trim() === '') {
            return '';
        }

        try {
            const marked = createMarkedInstance(width);
            const result = marked.parse(children);

            // Handle sync result
            if (typeof result === 'string') {
                // Trim trailing newlines but preserve internal structure
                return result.replace(/\n+$/, '');
            }

            // Fallback for async (shouldn't happen with our config)
            return children;
        } catch (error) {
            // Fallback to plain text on error
            console.error('Markdown render error:', error);
            return children;
        }
    }, [children, width]);

    return (
        <Box flexDirection="column">
            <Transform transform={(output) => output}>
                <Text wrap="wrap">
                    {renderedText}
                    {streaming && <Text dimColor>▌</Text>}
                </Text>
            </Transform>
        </Box>
    );
};

/**
 * Simple text component for when markdown is disabled
 */
export const PlainText: React.FC<{ children: string; streaming?: boolean }> = ({
    children,
    streaming = false,
}) => {
    return (
        <Box flexDirection="column">
            <Text wrap="wrap">
                {children}
                {streaming && <Text dimColor>▌</Text>}
            </Text>
        </Box>
    );
};

export default MarkdownText;
