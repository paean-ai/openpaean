/**
 * InputArea Component
 * User input with command handling using useStdin for raw input handling
 * Features: Tab completion, command suggestions, proper exit cleanup,
 *           multi-line paste (bracketed paste mode + fast-return fallback)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useStdin, useApp } from 'ink';

/**
 * If Enter arrives within this window after the last insertable character,
 * treat it as part of a paste (newline) rather than a submit.
 * Fallback for terminals that don't support bracketed paste mode.
 */
const FAST_RETURN_THRESHOLD_MS = 30;

const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';

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
    const callbacksRef = useRef({ onSubmit, onInputChange, onTabComplete });

    // Bracketed paste state
    const pasteBufferRef = useRef<string | null>(null);

    // Timestamp of last insertable character for fast-return heuristic
    const lastInsertTimeRef = useRef(0);

    useEffect(() => {
        callbacksRef.current = { onSubmit, onInputChange, onTabComplete };
    });

    const prevValueRef = useRef(value);
    useEffect(() => {
        if (prevValueRef.current !== value) {
            prevValueRef.current = value;
            callbacksRef.current.onInputChange?.(value);
        }
    }, [value]);

    // Cleanup function to properly exit
    const cleanExit = () => {
        process.stdout.write('\x1b[?2004l');
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
        setRawMode(true);
        rawModeRef.current = true;

        // Enable bracketed paste mode so the terminal wraps pasted content
        // with \x1b[200~ ... \x1b[201~ escape sequences
        process.stdout.write('\x1b[?2004h');

        const handleData = (data: Buffer) => {
            if (disabled) return;

            const input = data.toString();

            // Handle Ctrl+C - clean exit
            if (input === '\x03') {
                cleanExit();
                return;
            }

            // --- Bracketed paste handling ---
            const pasteStartIdx = input.indexOf(PASTE_START);
            if (pasteStartIdx !== -1) {
                if (pasteStartIdx > 0) {
                    handleData(Buffer.from(input.slice(0, pasteStartIdx)));
                }
                pasteBufferRef.current = '';
                const afterStart = input.slice(pasteStartIdx + PASTE_START.length);
                if (afterStart.length > 0) {
                    handleData(Buffer.from(afterStart));
                }
                return;
            }

            if (pasteBufferRef.current !== null) {
                const pasteEndIdx = input.indexOf(PASTE_END);
                if (pasteEndIdx !== -1) {
                    pasteBufferRef.current += input.slice(0, pasteEndIdx);
                    const pastedText = pasteBufferRef.current;
                    pasteBufferRef.current = null;

                    if (pastedText.length > 0) {
                        const normalized = pastedText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
                        setValue(prev => prev + normalized);
                    }

                    const afterEnd = input.slice(pasteEndIdx + PASTE_END.length);
                    if (afterEnd.length > 0) {
                        handleData(Buffer.from(afterEnd));
                    }
                } else {
                    pasteBufferRef.current += input;
                }
                return;
            }

            // Handle Tab key (0x09)
            if (input === '\t') {
                setValue(currentValue => {
                    const { onTabComplete } = callbacksRef.current;
                    if (onTabComplete && currentValue.startsWith('/')) {
                        const completed = onTabComplete(currentValue);
                        if (completed) return completed;
                    }
                    return currentValue;
                });
                return;
            }

            // Handle Enter (carriage return or newline)
            if (input === '\r' || input === '\n') {
                const now = Date.now();
                const timeSinceLastInsert = now - lastInsertTimeRef.current;

                // Fast-return heuristic: treat rapid Enter after printable chars as paste newline
                if (timeSinceLastInsert <= FAST_RETURN_THRESHOLD_MS) {
                    setValue(prev => prev + '\n');
                    return;
                }

                setValue(currentValue => {
                    if (currentValue.trim()) {
                        setTimeout(() => {
                            callbacksRef.current.onSubmit(currentValue.trim());
                        }, 0);
                        return '';
                    }
                    return currentValue;
                });
                return;
            }

            // Handle Backspace (0x7f or 0x08)
            if (input === '\x7f' || input === '\x08') {
                setValue(prev => prev.slice(0, -1));
                return;
            }

            // Handle Escape - clear suggestions
            if (input === '\x1b') {
                return;
            }

            // Handle regular printable characters
            const isPrintable = !input.startsWith('\x1b') &&
                input.length > 0 &&
                !Array.from(input).some(ch => ch.charCodeAt(0) < 32);

            if (isPrintable) {
                lastInsertTimeRef.current = Date.now();
                setValue(prev => prev + input);
            }
        };

        stdin.on('data', handleData);

        return () => {
            stdin.off('data', handleData);
            pasteBufferRef.current = null;
            process.stdout.write('\x1b[?2004l');
            if (rawModeRef.current) {
                try {
                    setRawMode(false);
                    rawModeRef.current = false;
                } catch {
                    // Ignore errors during cleanup
                }
            }
        };
    }, [stdin, setRawMode, disabled]);

    const isMultiLine = value.includes('\n');

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
            {/* Multi-line indicator */}
            {!disabled && isMultiLine && (
                <Box marginLeft={5}>
                    <Text dimColor>… (multi-line, Enter to send)</Text>
                </Box>
            )}
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
