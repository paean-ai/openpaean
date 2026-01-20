/**
 * StreamingText Component
 * Displays streaming text with markdown rendering
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { MarkdownText, PlainText } from './MarkdownText.js';

interface StreamingTextProps {
    text: string;
    isComplete?: boolean;
    rawMode?: boolean;
}

export const StreamingText: React.FC<StreamingTextProps> = ({
    text,
    isComplete = false,
    rawMode = false
}) => {
    const { stdout } = useStdout();
    const width = stdout?.columns || 80;

    return (
        <Box flexDirection="column">
            <Box>
                <Text color="magenta" bold>OpenPaean: </Text>
            </Box>
            <Box marginLeft={0} flexDirection="column">
                {rawMode ? (
                    <PlainText streaming={!isComplete}>{text}</PlainText>
                ) : (
                    <MarkdownText streaming={!isComplete} width={width - 4}>
                        {text}
                    </MarkdownText>
                )}
            </Box>
        </Box>
    );
};
