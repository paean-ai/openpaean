/**
 * MCP Server
 * Model Context Protocol server for AI agent integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getMcpResources, readMcpResource } from './resources.js';
import { getMcpTools, executeMcpTool } from './tools.js';

export interface McpServerOptions {
  debug?: boolean;
}

/**
 * Start the MCP server
 */
export async function startMcpServer(options: McpServerOptions = {}): Promise<void> {
  const server = new Server(
    {
      name: 'paean',
      version: '0.1.0',
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );

  // Debug logging
  const debug = (message: string, ...args: unknown[]) => {
    if (options.debug) {
      console.error(`[MCP Debug] ${message}`, ...args);
    }
  };

  // Handle list resources request
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    debug('Listing resources');
    const resources = await getMcpResources();
    return { resources };
  });

  // Handle read resource request
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    debug('Reading resource:', request.params.uri);
    const content = await readMcpResource(request.params.uri);
    return {
      contents: [
        {
          uri: request.params.uri,
          mimeType: 'application/json',
          text: JSON.stringify(content, null, 2),
        },
      ],
    };
  });

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    debug('Listing tools');
    const tools = getMcpTools();
    return { tools };
  });

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    debug('Calling tool:', request.params.name, request.params.arguments);
    const result = await executeMcpTool(
      request.params.name,
      request.params.arguments as Record<string, unknown>
    );
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  // Error handling
  server.onerror = (error) => {
    console.error('[MCP Error]', error);
  };

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  debug('MCP server started');

  // Keep server running
  process.on('SIGINT', () => {
    debug('Shutting down MCP server');
    process.exit(0);
  });
}
