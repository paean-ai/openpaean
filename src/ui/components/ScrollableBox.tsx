/**
 * ScrollableBox Component
 * A scrollable container with keyboard navigation support
 * Inspired by Claude Code and OpenCode TUI patterns
 */

import React, { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { Box, Text, useInput } from 'ink';

export interface ScrollableBoxProps {
    children: ReactNode;
    height: number;
    /** Called when scroll position changes */
    onScrollChange?: (scrollTop: number, maxScroll: number) => void;
    /** Whether to auto-scroll to bottom on new content */
    autoScroll?: boolean;
    /** Enable keyboard navigation */
    enableKeyboard?: boolean;
    /** Show scroll indicator */
    showIndicator?: boolean;
}

interface ScrollState {
    scrollTop: number;
    contentHeight: number;
    isAtBottom: boolean;
    userScrolled: boolean;
}

export const ScrollableBox: React.FC<ScrollableBoxProps> = ({
    children,
    height,
    onScrollChange,
    autoScroll = true,
    enableKeyboard = true,
    showIndicator = true,
}) => {
    const [scrollState, setScrollState] = useState<ScrollState>({
        scrollTop: 0,
        contentHeight: 0,
        isAtBottom: true,
        userScrolled: false,
    });

    // Track content changes for auto-scroll
    const childrenRef = useRef(children);
    const contentChanged = childrenRef.current !== children;
    childrenRef.current = children;

    // Calculate max scroll
    const maxScroll = Math.max(0, scrollState.contentHeight - height);
    const canScroll = scrollState.contentHeight > height;

    const scrollBy = useCallback((delta: number) => {
        setScrollState(prev => {
            const newScrollTop = Math.max(0, Math.min(prev.scrollTop + delta, maxScroll));
            const isAtBottom = newScrollTop >= maxScroll - 1;
            return {
                ...prev,
                scrollTop: newScrollTop,
                isAtBottom,
                userScrolled: delta < 0 ? true : prev.userScrolled,
            };
        });
    }, [maxScroll]);

    const scrollToBottom = useCallback(() => {
        setScrollState(prev => ({
            ...prev,
            scrollTop: maxScroll,
            isAtBottom: true,
            userScrolled: false,
        }));
    }, [maxScroll]);

    const scrollToTop = useCallback(() => {
        setScrollState(prev => ({
            ...prev,
            scrollTop: 0,
            isAtBottom: false,
            userScrolled: true,
        }));
    }, []);

    // Auto-scroll on content change
    useEffect(() => {
        if (autoScroll && contentChanged && !scrollState.userScrolled) {
            scrollToBottom();
        }
    }, [autoScroll, contentChanged, scrollState.userScrolled, scrollToBottom]);

    // Notify parent of scroll changes
    useEffect(() => {
        onScrollChange?.(scrollState.scrollTop, maxScroll);
    }, [scrollState.scrollTop, maxScroll, onScrollChange]);

    // Keyboard navigation
    useInput((input, key) => {
        if (!enableKeyboard || !canScroll) return;

        // Arrow keys: single line scroll
        if (key.upArrow) {
            scrollBy(-1);
        } else if (key.downArrow) {
            scrollBy(1);
        }

        // Page Up/Down: page scroll
        if (key.pageUp) {
            scrollBy(-Math.max(1, height - 2));
        } else if (key.pageDown) {
            scrollBy(Math.max(1, height - 2));
        }

        // Home/End: jump to top/bottom
        if (input === 'g' && key.ctrl) {
            scrollToTop();
        } else if (input === 'G') {
            scrollToBottom();
        }

        // Ctrl+Home / Ctrl+End alternatives
        if (key.ctrl && key.upArrow) {
            scrollToTop();
        } else if (key.ctrl && key.downArrow) {
            scrollToBottom();
        }
    }, { isActive: enableKeyboard });

    // Calculate scroll indicator position
    const indicatorPosition = maxScroll > 0
        ? Math.round((scrollState.scrollTop / maxScroll) * (height - 1))
        : 0;

    return (
        <Box flexDirection="row" height={height}>
            {/* Content area */}
            <Box
                flexDirection="column"
                flexGrow={1}
                overflow="hidden"
            >
                <Box
                    flexDirection="column"
                    marginTop={-scrollState.scrollTop}
                >
                    {children}
                </Box>
            </Box>

            {/* Scroll indicator */}
            {showIndicator && canScroll && (
                <Box flexDirection="column" width={1} marginLeft={1}>
                    {Array.from({ length: height }).map((_, i) => (
                        <Text
                            key={i}
                            color={i === indicatorPosition ? 'magenta' : 'gray'}
                            dimColor={i !== indicatorPosition}
                        >
                            {i === indicatorPosition ? '█' : '│'}
                        </Text>
                    ))}
                </Box>
            )}

            {/* New content indicator */}
            {showIndicator && scrollState.userScrolled && !scrollState.isAtBottom && (
                <Box position="absolute" marginTop={height - 1}>
                    <Text color="yellow" bold>↓ New messages (press End)</Text>
                </Box>
            )}
        </Box>
    );
};

export default ScrollableBox;
