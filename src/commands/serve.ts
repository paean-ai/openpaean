/**
 * Serve Command
 * Start the MCP server for AI agent integration
 */

import { Command } from 'commander';
import { isAuthenticated } from '../utils/config.js';
import { startMcpServer } from '../mcp/server.js';

export const serveCommand = new Command('serve')
  .description('Start MCP server for AI agent integration')
  .option('--stdio', 'Use stdio transport (default)', true)
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    if (!isAuthenticated()) {
      // Write to stderr so it doesn't interfere with MCP protocol
      console.error('Error: Not authenticated. Please run "paean login" first.');
      process.exit(1);
    }

    try {
      await startMcpServer({
        debug: options.debug,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`MCP server error: ${message}`);
      process.exit(1);
    }
  });
