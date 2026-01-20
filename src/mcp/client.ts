/**
 * MCP Client
 * Local MCP server management for CLI
 * Spawns and manages MCP servers using stdio transport
 */

import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface as ReadlineInterface } from 'readline';
import { homedir } from 'os';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import type { McpToolInfo, McpToolResult, McpContentItem } from '../agent/types.js';

/**
 * MCP server configuration
 */
export interface McpServerConfig {
    command: string;
    args: string[];
    env?: Record<string, string>;
    cwd?: string;
}

/**
 * MCP configuration file format
 */
export interface McpConfig {
    mcpServers: Record<string, McpServerConfig>;
}

/**
 * JSON-RPC request
 */
interface JsonRpcRequest {
    jsonrpc: '2.0';
    id: number;
    method: string;
    params?: unknown;
}

/**
 * JSON-RPC response
 */
interface JsonRpcResponse {
    jsonrpc: '2.0';
    id: number;
    result?: unknown;
    error?: {
        code: number;
        message: string;
        data?: unknown;
    };
}

/**
 * Connected MCP server instance
 */
interface McpServerInstance {
    name: string;
    process: ChildProcess;
    stdin: NodeJS.WritableStream;
    stdout: ReadlineInterface;
    tools: McpToolInfo[];
    requestId: number;
    pendingRequests: Map<number, {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
    }>;
    connected: boolean;
    lastError?: string;
}

/**
 * MCP Client class
 */
export class McpClient {
    private servers: Map<string, McpServerInstance> = new Map();
    private configPath: string;
    private debug: boolean;

    constructor(options?: { debug?: boolean }) {
        this.debug = options?.debug ?? false;
        this.configPath = join(homedir(), '.paean', 'mcp_config.json');
    }

    /**
     * Log debug message
     */
    private log(message: string, ...args: unknown[]): void {
        if (this.debug) {
            console.error(`[MCP] ${message}`, ...args);
        }
    }

    /**
     * Format MCP error with user-friendly messages
     * Detects "occupied" errors and provides clear guidance
     */
    static formatError(error: string | Error, serverName?: string): string {
        const errorStr = error instanceof Error ? error.message : error;
        const prefix = serverName ? `${serverName}: ` : '';

        // Detect "server occupied by another client" pattern
        const lowerError = errorStr.toLowerCase();
        if (
            lowerError.includes('already connected') ||
            lowerError.includes('in use') ||
            lowerError.includes('address already in use') ||
            lowerError.includes('eaddrinuse')
        ) {
            return `${prefix}Server is occupied by another client (e.g., Cursor, Claude Desktop). Close the other client first.`;
        }

        // Detect command not found
        if (lowerError.includes('not found') || lowerError.includes('enoent')) {
            return `${prefix}Command not found. Ensure the MCP server package is installed.`;
        }

        // Detect timeout
        if (lowerError.includes('timeout')) {
            return `${prefix}Connection timed out. The server may be unresponsive.`;
        }

        return `${prefix}${errorStr}`;
    }

    /**
     * Check if error indicates server is occupied
     */
    static isOccupiedError(error: string | Error): boolean {
        const errorStr = error instanceof Error ? error.message : error;
        const lowerError = errorStr.toLowerCase();
        return (
            lowerError.includes('already connected') ||
            lowerError.includes('in use') ||
            lowerError.includes('address already in use') ||
            lowerError.includes('eaddrinuse')
        );
    }

    /**
     * Get config path
     */
    getConfigPath(): string {
        return this.configPath;
    }

    /**
     * Load MCP configuration
     */
    loadConfig(): McpConfig | null {
        if (!existsSync(this.configPath)) {
            this.log('Config file not found:', this.configPath);
            return null;
        }

        try {
            const content = readFileSync(this.configPath, 'utf-8');
            return JSON.parse(content) as McpConfig;
        } catch (error) {
            this.log('Failed to load config:', error);
            return null;
        }
    }

    /**
     * List configured server names
     */
    listServers(): string[] {
        const config = this.loadConfig();
        if (!config?.mcpServers) return [];
        return Object.keys(config.mcpServers);
    }

    /**
     * Connect to an MCP server with improved error handling
     */
    async connect(serverName: string): Promise<McpToolInfo[]> {
        const config = this.loadConfig();
        if (!config?.mcpServers?.[serverName]) {
            throw new Error(`Server "${serverName}" not found in config`);
        }

        const serverConfig = config.mcpServers[serverName];
        this.log(`Connecting to ${serverName}:`, serverConfig.command, serverConfig.args);

        // Resolve command (prefer bunx over npx for speed)
        const command = this.resolveCommand(serverConfig.command);
        this.log(`Using command: ${command}`);

        // Spawn the process with detached to prevent signal propagation
        const proc = spawn(command, serverConfig.args, {
            cwd: serverConfig.cwd,
            env: { ...process.env, ...serverConfig.env },
            stdio: ['pipe', 'pipe', 'pipe'],
            detached: false, // Keep attached but don't forward signals
        });

        // Prevent unhandled promise rejection if process exits
        proc.on('error', () => { });

        if (!proc.stdin || !proc.stdout) {
            throw new Error('Failed to create process pipes');
        }

        // Create readline interface for stdout
        const stdout = createInterface({
            input: proc.stdout,
            crlfDelay: Infinity,
        });

        const instance: McpServerInstance = {
            name: serverName,
            process: proc,
            stdin: proc.stdin,
            stdout,
            tools: [],
            requestId: 0,
            pendingRequests: new Map(),
            connected: false,
        };

        // Collect stderr for debugging
        let stderrBuffer = '';
        if (proc.stderr) {
            proc.stderr.on('data', (data) => {
                const text = data.toString();
                stderrBuffer += text;
                this.log(`[${serverName} stderr] ${text.trim()}`);
            });
        }

        // Handle stdout lines
        stdout.on('line', (line) => {
            this.handleLine(instance, line);
        });

        // Handle process errors
        proc.on('error', (error) => {
            this.log(`Process error for ${serverName}:`, error);
            instance.lastError = error.message;
            instance.connected = false;
        });

        proc.on('exit', (code, signal) => {
            this.log(`Process ${serverName} exited with code ${code}, signal ${signal}`);
            instance.connected = false;
            if (code !== 0 && stderrBuffer) {
                instance.lastError = stderrBuffer.slice(-500); // Keep last 500 chars
            }
            // Don't delete from servers map - keep for status reporting
        });

        // Store the instance before initialization
        this.servers.set(serverName, instance);

        try {
            // Give process time to start
            await new Promise(resolve => setTimeout(resolve, 500));

            // Check if process is still running
            if (proc.exitCode !== null) {
                throw new Error(`Process exited immediately with code ${proc.exitCode}. ${stderrBuffer.slice(-200)}`);
            }

            // Initialize the server with timeout
            await this.initializeWithTimeout(instance, 10000);

            // List tools
            const tools = await this.listToolsWithTimeout(instance, 10000);
            instance.tools = tools;
            instance.connected = true;

            this.log(`Successfully connected to ${serverName} with ${tools.length} tools`);
            return tools;
        } catch (error) {
            instance.connected = false;
            instance.lastError = (error as Error).message;
            this.log(`Failed to initialize ${serverName}:`, error);

            // Kill the process if it's still running
            if (proc.exitCode === null) {
                proc.kill();
            }

            // Remove from servers map on failure
            this.servers.delete(serverName);
            throw error;
        }
    }

    /**
     * Resolve command to full path, preferring bunx over npx
     */
    private resolveCommand(cmd: string): string {
        if (cmd === 'npx') {
            // Try to use bunx if available (faster startup)
            try {
                const { execSync } = require('child_process');
                execSync('which bunx', { stdio: 'pipe' });
                return 'bunx';
            } catch {
                return 'npx';
            }
        }
        return cmd;
    }

    /**
     * Handle a line from stdout
     */
    private handleLine(instance: McpServerInstance, line: string): void {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Skip common npm/shell noise
        if (!trimmed.startsWith('{')) {
            this.log(`[${instance.name}] Non-JSON: ${trimmed.substring(0, 80)}`);
            return;
        }

        try {
            const response = JSON.parse(trimmed) as JsonRpcResponse;

            // Handle responses with id
            if (response.id !== undefined) {
                const pending = instance.pendingRequests.get(response.id);
                if (pending) {
                    instance.pendingRequests.delete(response.id);
                    if (response.error) {
                        pending.reject(new Error(response.error.message));
                    } else {
                        pending.resolve(response.result);
                    }
                }
            }
        } catch (error) {
            this.log(`[${instance.name}] JSON parse error:`, error);
        }
    }

    /**
     * Send a JSON-RPC request with timeout
     */
    private async sendRequest(
        instance: McpServerInstance,
        method: string,
        params?: unknown,
        timeoutMs: number = 30000
    ): Promise<unknown> {
        // Check if process is still alive
        if (instance.process.exitCode !== null) {
            throw new Error(`Server process has exited (code ${instance.process.exitCode})`);
        }

        const id = ++instance.requestId;
        const request: JsonRpcRequest = {
            jsonrpc: '2.0',
            id,
            method,
            params,
        };

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                instance.pendingRequests.delete(id);
                reject(new Error(`Request ${method} timed out after ${timeoutMs}ms`));
            }, timeoutMs);

            instance.pendingRequests.set(id, {
                resolve: (value) => {
                    clearTimeout(timeout);
                    resolve(value);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                },
            });

            const message = JSON.stringify(request) + '\n';
            instance.stdin.write(message, (err) => {
                if (err) {
                    clearTimeout(timeout);
                    instance.pendingRequests.delete(id);
                    reject(new Error(`Failed to write to stdin: ${err.message}`));
                }
            });
            this.log(`Sent ${method} request (id=${id})`);
        });
    }

    /**
     * Initialize the MCP server with timeout
     */
    private async initializeWithTimeout(instance: McpServerInstance, timeoutMs: number): Promise<void> {
        await this.sendRequest(instance, 'initialize', {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
                name: 'paean-cli',
                version: '0.2.1',
            },
        }, timeoutMs);

        // Send initialized notification
        const notification = JSON.stringify({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        }) + '\n';
        instance.stdin.write(notification);
    }

    /**
     * List tools with timeout
     */
    private async listToolsWithTimeout(instance: McpServerInstance, timeoutMs: number): Promise<McpToolInfo[]> {
        const result = await this.sendRequest(instance, 'tools/list', undefined, timeoutMs) as {
            tools?: Array<{
                name: string;
                description?: string;
                inputSchema?: Record<string, unknown>;
            }>;
        };

        return (result?.tools || []).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema || {},
        }));
    }

    /**
     * Call a tool on a connected server (with auto-reconnect)
     */
    async callTool(
        serverName: string,
        toolName: string,
        args: Record<string, unknown> = {}
    ): Promise<McpToolResult> {
        let instance = this.servers.get(serverName);

        // Auto-reconnect if server died
        if (!instance || !instance.connected || instance.process.exitCode !== null) {
            this.log(`Server ${serverName} not connected, attempting reconnect...`);

            try {
                await this.connect(serverName);
                instance = this.servers.get(serverName);
            } catch (error) {
                return {
                    content: [{ type: 'text', text: `Failed to reconnect to "${serverName}": ${(error as Error).message}` }],
                    isError: true,
                };
            }
        }

        if (!instance || !instance.connected) {
            return {
                content: [{ type: 'text', text: `Server "${serverName}" not available` }],
                isError: true,
            };
        }

        try {
            const result = await this.sendRequest(instance, 'tools/call', {
                name: toolName,
                arguments: args,
            }, 60000) as {
                content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
                isError?: boolean;
            };

            return {
                content: (result?.content || []).map((item) => ({
                    type: item.type as McpContentItem['type'],
                    text: item.text,
                    data: item.data,
                    mimeType: item.mimeType,
                })),
                isError: result?.isError ?? false,
            };
        } catch (error) {
            instance.connected = false;
            instance.lastError = (error as Error).message;
            return {
                content: [{ type: 'text', text: `Tool call failed: ${(error as Error).message}` }],
                isError: true,
            };
        }
    }

    /**
     * Check if a server is actually connected and responsive
     */
    isServerConnected(serverName: string): boolean {
        const instance = this.servers.get(serverName);
        if (!instance) return false;
        return instance.connected && instance.process.exitCode === null;
    }

    /**
     * Get last error for a server
     */
    getServerError(serverName: string): string | undefined {
        return this.servers.get(serverName)?.lastError;
    }

    /**
     * Disconnect from a server
     */
    async disconnect(serverName: string): Promise<void> {
        const instance = this.servers.get(serverName);
        if (!instance) return;

        if (instance.process.exitCode === null) {
            instance.process.kill();
        }
        this.servers.delete(serverName);
    }

    /**
     * Disconnect from all servers
     */
    async disconnectAll(): Promise<void> {
        for (const name of this.servers.keys()) {
            await this.disconnect(name);
        }
    }

    /**
     * Get connected server names (only truly connected)
     */
    getConnectedServers(): string[] {
        const connected: string[] = [];
        for (const [name, instance] of this.servers) {
            if (instance.connected && instance.process.exitCode === null) {
                connected.push(name);
            }
        }
        return connected;
    }

    /**
     * Get all tools from all connected servers
     */
    getAllTools(): Map<string, McpToolInfo[]> {
        const result = new Map<string, McpToolInfo[]>();
        for (const [name, instance] of this.servers) {
            if (instance.connected && instance.process.exitCode === null) {
                result.set(name, instance.tools);
            }
        }
        return result;
    }

    /**
     * Get total tool count across all connected servers
     */
    getTotalToolCount(): number {
        let count = 0;
        for (const instance of this.servers.values()) {
            if (instance.connected && instance.process.exitCode === null) {
                count += instance.tools.length;
            }
        }
        return count;
    }
}

// Export singleton instance
export const mcpClient = new McpClient();
