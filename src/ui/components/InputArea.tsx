/**
 * InputArea Component
 * User input with command handling using useStdin for raw input handling
 * Features: Tab completion, command suggestions, proper exit cleanup
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdin, useApp } from 'ink';

interface InputAreaProps {
    onSubmit: (value: string) => void;
    onInputChange?: (value: string) => void;
    onTabComplete?: (value: string) => string | null;
    suggestions?: string[];
    disabled?: boolean;
}

export const InputArea: React.FC<InputAreaProps> = ({
    onSubmit,
    onInputChange,
    onTabComplete,
    suggestions = [],
    disabled = false
}) => {
    const [value, setValue] = useState('');
    const { stdin, setRawMode } = useStdin();
    const { exit } = useApp();
    const rawModeRef = useRef(true);

    // Cleanup function to properly exit
    const cleanExit = () => {
        if (rawModeRef.current) {
            try {
                setRawMode(false);
                rawModeRef.current = false;
            } catch {
                // Ignore errors during cleanup
            }
        }
        exit();
    };

    useEffect(() => {
        // Set raw mode to capture individual key presses
        setRawMode(true);
        rawModeRef.current = true;

        const handleData = (data: Buffer) => {
            if (disabled) return;

            const input = data.toString();

            // Handle Ctrl+C - clean exit
            if (input === '\x03') {
                cleanExit();
                return;
            }

            // Handle Tab key (0x09)
            if (input === '\t') {
                if (onTabComplete && value.startsWith('/')) {
                    const completed = onTabComplete(value);
                    if (completed) {
                        setValue(completed);
                        onInputChange?.(completed);
                    }
                }
                return;
            }

            // Handle Enter (carriage return or newline)
            if (input === '\r' || input === '\n') {
                if (value.trim()) {
                    onSubmit(value.trim());
                    setValue('');
                    onInputChange?.('');
                }
                return;
            }

            // Handle Backspace (0x7f or 0x08)
            if (input === '\x7f' || input === '\x08') {
                setValue(prev => {
                    const newVal = prev.slice(0, -1);
                    onInputChange?.(newVal);
                    return newVal;
                });
                return;
            }

            // Handle Escape - clear suggestions
            if (input === '\x1b') {
                return;
            }

            // Handle regular printable characters
            if (input.length === 1 && input.charCodeAt(0) >= 32) {
                setValue(prev => {
                    const newVal = prev + input;
                    onInputChange?.(newVal);
                    return newVal;
                });
            } else if (input.length > 1 && !input.startsWith('\x1b')) {
                // Handle pasted text
                setValue(prev => {
                    const newVal = prev + input;
                    onInputChange?.(newVal);
                    return newVal;
                });
            }
        };

        stdin.on('data', handleData);

        return () => {
            stdin.off('data', handleData);
            // Cleanup raw mode on unmount
            if (rawModeRef.current) {
                try {
                    setRawMode(false);
                    rawModeRef.current = false;
                } catch {
                    // Ignore errors during cleanup
                }
            }
        };
    }, [stdin, setRawMode, disabled, value, onSubmit, onInputChange, onTabComplete]);

    return (
        <Box flexDirection="column">
            <Box>
                <Text color="cyan" bold>You: </Text>
                {disabled ? (
                    <Text dimColor>...</Text>
                ) : (
                    <>
                        <Text>{value}</Text>
                        <Text color="gray">▌</Text>
                    </>
                )}
            </Box>
            {/* Command suggestions */}
            {!disabled && suggestions.length > 0 && (
                <Box marginLeft={5} marginTop={0}>
                    <Text dimColor>
                        {suggestions.length === 1
                            ? `Tab → ${suggestions[0]}`
                            : suggestions.slice(0, 5).join('  ')}
                    </Text>
                </Box>
            )}
        </Box>
    );
};
