/**
 * StreamingText Component
 * Displays streaming text with optional markdown rendering
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StreamingTextProps {
    text: string;
    isComplete?: boolean;
    rawMode?: boolean;
}

export const StreamingText: React.FC<StreamingTextProps> = ({
    text,
    isComplete = false,
    rawMode: _rawMode = false
}) => {
    // For now, we render plain text
    // TODO: Add ink-markdown integration for rich rendering
    return (
        <Box flexDirection="column">
            <Box>
                <Text color="magenta" bold>Pæan: </Text>
            </Box>
            <Box marginLeft={0}>
                <Text wrap="wrap">{text}</Text>
                {!isComplete && <Text dimColor>▌</Text>}
            </Box>
        </Box>
    );
};
