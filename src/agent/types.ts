/**
 * Agent Types
 * TypeScript types for agent streaming and callbacks
 */

/**
 * Agent stream event types from SSE
 */
export type AgentStreamEventType =
    | 'content'
    | 'tool_call'
    | 'tool_result'
    | 'mcp_tool_call'
    | 'done'
    | 'error';

/**
 * Agent stream event structure
 */
export interface AgentStreamEvent {
    type: AgentStreamEventType;
    data: {
        // Content event
        text?: string;
        partial?: boolean;
        // Tool call/result event
        id?: string;
        name?: string;
        result?: unknown;
        // MCP tool call event
        callId?: string;
        serverName?: string;
        toolName?: string;
        arguments?: Record<string, unknown>;
        argumentsJson?: string;
        conversationId?: string;
        // Done event
        // Error event
        error?: string;
    };
}

/**
 * Callbacks for agent stream events
 */
export interface AgentStreamCallbacks {
    onContent?: (text: string, partial: boolean) => void;
    onToolCall?: (id: string, name: string) => void;
    onToolResult?: (id: string, name: string, result?: unknown) => void;
    onMcpToolCall?: (
        callId: string,
        serverName: string,
        toolName: string,
        args: Record<string, unknown>
    ) => Promise<McpToolResult>;
    onDone?: (conversationId: string) => void;
    onError?: (error: string) => void;
}

/**
 * MCP tool call result
 */
export interface McpToolResult {
    content: McpContentItem[];
    isError: boolean;
}

/**
 * MCP content item
 */
export interface McpContentItem {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
}

/**
 * MCP server status
 */
export interface McpServerStatus {
    name: string;
    connected: boolean;
    tools: McpToolInfo[];
    error?: string;
}

/**
 * MCP tool info
 */
export interface McpToolInfo {
    name: string;
    description?: string;
    inputSchema: Record<string, unknown>;
}

/**
 * MCP state for API calls
 */
export interface McpState {
    mcpEnabled: boolean;
    mcpServers: Array<{
        name: string;
        connected: boolean;
        tools: McpToolInfo[];
    }>;
}
