/**
 * Spinner Component
 * Loading indicator for thinking/processing states
 */

import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface SpinnerProps {
    label?: string;
    type?: 'thinking' | 'tool' | 'mcp';
}

export const Spinner: React.FC<SpinnerProps> = ({
    label = 'Thinking...',
    type = 'thinking'
}) => {
    const color = type === 'mcp' ? 'yellow' : type === 'tool' ? 'cyan' : 'magenta';

    return (
        <Box>
            <Text color={color}>
                <InkSpinner type="dots" />
            </Text>
            <Text dimColor> {label}</Text>
        </Box>
    );
};
