/**
 * Fullscreen App Wrapper
 * Provides fullscreen terminal experience using alternate screen buffer
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import { App, type AppProps } from './App.js';

interface FullscreenAppProps extends AppProps {
    title?: string;
}

/**
 * Get terminal dimensions
 */
function useTerminalSize() {
    const { stdout } = useStdout();
    const [size, setSize] = useState({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
    });

    useEffect(() => {
        if (!stdout) return;

        const handleResize = () => {
            setSize({
                width: stdout.columns || 80,
                height: stdout.rows || 24,
            });
        };

        stdout.on('resize', handleResize);
        return () => {
            stdout.off('resize', handleResize);
        };
    }, [stdout]);

    return size;
}

/**
 * Fullscreen App Component
 * Wraps the main App in a fullscreen container with header and footer
 */
export const FullscreenApp: React.FC<FullscreenAppProps> = (props) => {
    const { width, height } = useTerminalSize();
    const { title = 'OpenPaean AI Agent' } = props;

    // Calculate content height (minus header and footer)
    const headerHeight = 3;
    const footerHeight = 1;
    const contentHeight = Math.max(height - headerHeight - footerHeight, 10);

    return (
        <Box
            flexDirection="column"
            width={width}
            height={height}
        >
            {/* Fixed Header */}
            <Box
                height={headerHeight}
                borderStyle="single"
                borderColor="magenta"
                paddingX={1}
                justifyContent="space-between"
                alignItems="center"
            >
                <Text bold color="magenta">{title}</Text>
                <Box>
                    {props.mcpState?.mcpServers && props.mcpState.mcpServers.length > 0 && (
                        <Text dimColor>
                            🔗 MCP: {props.mcpState.mcpServers.reduce(
                                (sum, s) => sum + (s.tools?.length || 0), 0
                            )} tools
                        </Text>
                    )}
                </Box>
            </Box>

            {/* Scrollable Content Area */}
            <Box
                flexDirection="column"
                height={contentHeight}
                overflow="hidden"
            >
                <App {...props} fullscreen />
            </Box>

            {/* Fixed Footer / Status Bar */}
            <Box
                height={footerHeight}
                paddingX={1}
                justifyContent="space-between"
            >
                <Text dimColor>Ctrl+C: Exit</Text>
                <Text dimColor>/help: Commands</Text>
            </Box>
        </Box>
    );
};

export default FullscreenApp;
