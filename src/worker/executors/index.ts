/**
 * Executor Framework
 * Base interface and registry for multi-agent executors
 */

import type { ExecutorType, ExecutorOptions, ExecutorResult, ExecutorConfig, AvailabilityStatus } from '../types.js';

export interface AgentExecutor {
    readonly type: ExecutorType;
    isAvailable(): Promise<boolean>;
    execute(prompt: string, options?: ExecutorOptions): Promise<ExecutorResult>;
    abort(): void;
    checkAvailability?(): Promise<AvailabilityStatus>;
}

export class ExecutorRegistry {
    private executors: Map<ExecutorType, AgentExecutor> = new Map();
    private configs: Map<ExecutorType, ExecutorConfig> = new Map();

    register(executor: AgentExecutor, config?: ExecutorConfig): void {
        this.executors.set(executor.type, executor);
        if (config) {
            this.configs.set(executor.type, config);
        }
    }

    get(type: ExecutorType): AgentExecutor | undefined {
        return this.executors.get(type);
    }

    getConfig(type: ExecutorType): ExecutorConfig | undefined {
        return this.configs.get(type);
    }

    isEnabled(type: ExecutorType): boolean {
        const config = this.configs.get(type);
        return config?.enabled !== false;
    }

    async getAvailable(): Promise<ExecutorType[]> {
        const available: ExecutorType[] = [];
        for (const [type, executor] of this.executors) {
            if (!this.isEnabled(type)) continue;
            try {
                if (await executor.isAvailable()) {
                    available.push(type);
                }
            } catch {
                // Not available
            }
        }
        return available;
    }

    getRegistered(): ExecutorType[] {
        return Array.from(this.executors.keys());
    }

    async execute(
        type: ExecutorType,
        prompt: string,
        options?: ExecutorOptions
    ): Promise<ExecutorResult> {
        const executor = this.executors.get(type);
        if (!executor) {
            return {
                success: false,
                output: '',
                error: `Executor '${type}' not registered`,
                durationMs: 0,
            };
        }

        const available = await executor.isAvailable();
        if (!available) {
            return {
                success: false,
                output: '',
                error: `Executor '${type}' is not available on this system`,
                durationMs: 0,
            };
        }

        const config = this.configs.get(type);
        const mergedOptions: ExecutorOptions = {
            timeout: config?.timeout,
            args: config?.defaultArgs,
            ...options,
        };

        return executor.execute(prompt, mergedOptions);
    }
}

let registryInstance: ExecutorRegistry | null = null;

export function getExecutorRegistry(): ExecutorRegistry {
    if (!registryInstance) {
        registryInstance = new ExecutorRegistry();
    }
    return registryInstance;
}

export function resetExecutorRegistry(): void {
    registryInstance = null;
}
