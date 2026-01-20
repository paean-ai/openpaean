/**
 * ToolCallIndicator Component
 * Visual indicator for tool calls and MCP operations
 */

import React from 'react';
import { Box, Text } from 'ink';
import InkSpinner from 'ink-spinner';

interface ToolCallIndicatorProps {
    name: string;
    type?: 'tool' | 'mcp';
    serverName?: string;
    status?: 'pending' | 'completed' | 'error';
}

export const ToolCallIndicator: React.FC<ToolCallIndicatorProps> = ({
    name,
    type = 'tool',
    serverName,
    status = 'pending'
}) => {
    const icon = type === 'mcp' ? '🔌' : '🔧';
    const color = status === 'error' ? 'red' : status === 'completed' ? 'green' : 'cyan';
    const statusIcon = status === 'completed' ? '✓' : status === 'error' ? '✗' : null;

    return (
        <Box>
            {status === 'pending' ? (
                <Text color={color}>
                    <InkSpinner type="dots" />
                </Text>
            ) : (
                <Text color={color}>{statusIcon}</Text>
            )}
            <Text dimColor> {icon} </Text>
            {serverName && <Text color="yellow">{serverName}</Text>}
            {serverName && <Text dimColor> → </Text>}
            <Text color="cyan">{name}</Text>
            {status === 'pending' && <Text dimColor>...</Text>}
        </Box>
    );
};
