/**
 * Header Component
 * Displays welcome message and MCP connection status
 */

import React from 'react';
import { Box, Text } from 'ink';

interface HeaderProps {
    mcpToolCount?: number;
}

export const Header: React.FC<HeaderProps> = ({ mcpToolCount }) => {
    return (
        <Box flexDirection="column" marginBottom={1}>
            <Box borderStyle="round" paddingX={2}>
                <Text bold color="magenta">OpenPaean AI Agent</Text>
            </Box>
            <Box marginTop={1} flexDirection="column">
                {mcpToolCount && mcpToolCount > 0 ? (
                    <Text dimColor>  🔗 MCP: {mcpToolCount} tools connected</Text>
                ) : null}
                <Text dimColor>  Type your message and press Enter to send.</Text>
                <Text dimColor>  Press Ctrl+C to exit.</Text>
            </Box>
        </Box>
    );
};
