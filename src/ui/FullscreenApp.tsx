/**
 * Fullscreen App Wrapper
 * Provides fullscreen terminal experience using alternate screen buffer
 * With scroll position indicator and keyboard navigation hints
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { App, type AppProps } from './App.js';

interface FullscreenAppProps extends AppProps {
    title?: string;
}

/**
 * Hook to get terminal dimensions with resize handling
 */
function useTerminalSize() {
    const { stdout } = useStdout();
    const [size, setSize] = React.useState({
        width: stdout?.columns || 80,
        height: stdout?.rows || 24,
    });

    React.useEffect(() => {
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

    // MCP tool count
    const mcpToolCount = props.mcpState?.mcpServers?.reduce(
        (sum, s) => sum + (s.tools?.length || 0), 0
    ) || 0;

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
                    {mcpToolCount > 0 && (
                        <Text dimColor>
                            🔗 MCP: {mcpToolCount} tools
                        </Text>
                    )}
                </Box>
            </Box>

            {/* Scrollable Content Area */}
            <Box
                flexDirection="column"
                height={contentHeight}
            >
                <App
                    {...props}
                    fullscreen
                />
            </Box>

            {/* Fixed Footer / Status Bar */}
            <Box
                height={footerHeight}
                paddingX={1}
                justifyContent="space-between"
            >
                <Text dimColor>
                    <Text color="gray">Ctrl+C</Text> Exit
                    <Text color="gray"> │ </Text>
                    <Text color="gray">↑↓</Text> Scroll
                    <Text color="gray"> │ </Text>
                    <Text color="gray">PgUp/Dn</Text> Page
                </Text>
                <Text dimColor>/help: Commands</Text>
            </Box>
        </Box>
    );
};

export default FullscreenApp;
