/**
 * Input History Management
 * Persistent command history with search capabilities
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

/**
 * History entry
 */
export interface HistoryEntry {
    command: string;
    timestamp: number;
}

/**
 * History options
 */
export interface HistoryOptions {
    maxSize?: number;
    historyPath?: string;
}

/**
 * Default history options
 */
const DEFAULT_OPTIONS = {
    maxSize: 1000,
    historyPath: join(homedir(), '.openpaean', 'history'),
};

/**
 * Input History class
 */
export class InputHistory {
    private history: HistoryEntry[] = [];
    private index: number = -1;
    private tempInput: string = '';
    private options: Required<HistoryOptions>;

    constructor(options: HistoryOptions = {}) {
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.load();
    }

    /**
     * Load history from file
     */
    private load(): void {
        if (existsSync(this.options.historyPath)) {
            try {
                const content = readFileSync(this.options.historyPath, 'utf-8');
                const lines = content.trim().split('\n');

                this.history = lines
                    .map(line => {
                        try {
                            return JSON.parse(line) as HistoryEntry;
                        } catch {
                            // Fallback: treat line as plain command
                            return { command: line, timestamp: Date.now() };
                        }
                    })
                    .filter(entry => entry.command.trim().length > 0);

                // Limit size
                if (this.history.length > this.options.maxSize) {
                    this.history = this.history.slice(-this.options.maxSize);
                }
            } catch (error) {
                this.history = [];
            }
        }
        this.index = this.history.length;
    }

    /**
     * Save history to file
     */
    private save(): void {
        try {
            const dir = join(this.options.historyPath, '..');
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }

            const content = this.history
                .map(entry => JSON.stringify(entry))
                .join('\n');

            writeFileSync(this.options.historyPath, content, 'utf-8');
        } catch (error) {
            // Silently fail on save errors
        }
    }

    /**
     * Add a command to history
     */
    add(command: string): void {
        const trimmed = command.trim();
        if (trimmed.length === 0) return;

        // Skip duplicates of the most recent entry
        if (this.history.length > 0 && this.history[this.history.length - 1].command === trimmed) {
            return;
        }

        this.history.push({
            command: trimmed,
            timestamp: Date.now(),
        });

        // Trim if over max size
        if (this.history.length > this.options.maxSize) {
            this.history.shift();
        }

        this.save();
        this.index = this.history.length;
    }

    /**
     * Get previous command (up arrow)
     */
    getPrevious(currentInput: string): string | null {
        if (this.history.length === 0) return null;

        // Save current input on first navigation
        if (this.index === this.history.length) {
            this.tempInput = currentInput;
        }

        if (this.index > 0) {
            this.index--;
            return this.history[this.index].command;
        }

        return null;
    }

    /**
     * Get next command (down arrow)
     */
    getNext(): string | null {
        if (this.index < this.history.length - 1) {
            this.index++;
            return this.history[this.index].command;
        }

        // Return to current input
        if (this.index === this.history.length - 1) {
            this.index = this.history.length;
            return this.tempInput;
        }

        return null;
    }

    /**
     * Search backwards for matching command
     */
    search(prefix: string, startIndex?: number): { command: string; index: number } | null {
        const start = startIndex ?? this.history.length;
        for (let i = start - 1; i >= 0; i--) {
            if (this.history[i].command.toLowerCase().startsWith(prefix.toLowerCase())) {
                return { command: this.history[i].command, index: i };
            }
        }
        return null;
    }

    /**
     * Fuzzy search in history
     */
    fuzzySearch(query: string, limit: number = 10): HistoryEntry[] {
        const lowerQuery = query.toLowerCase();

        return this.history
            .filter(entry => entry.command.toLowerCase().includes(lowerQuery))
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    /**
     * Get all history entries
     */
    getAll(): HistoryEntry[] {
        return [...this.history];
    }

    /**
     * Get history entry at index
     */
    getAt(index: number): string | null {
        if (index >= 0 && index < this.history.length) {
            return this.history[index].command;
        }
        return null;
    }

    /**
     * Clear history
     */
    clear(): void {
        this.history = [];
        this.index = 0;
        this.save();
    }

    /**
     * Reset navigation index
     */
    resetIndex(): void {
        this.index = this.history.length;
        this.tempInput = '';
    }

    /**
     * Get size
     */
    get size(): number {
        return this.history.length;
    }
}

/**
 * Singleton instance
 */
let historyInstance: InputHistory | null = null;

/**
 * Get the history singleton
 */
export function getHistory(): InputHistory {
    if (!historyInstance) {
        historyInstance = new InputHistory();
    }
    return historyInstance;
}

/**
 * Reset the history singleton (for testing)
 */
export function resetHistory(): void {
    historyInstance = null;
}
