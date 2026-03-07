#!/usr/bin/env node
/**
 * OpenPaean CLI
 * Open source AI agent with fullscreen TUI and local MCP integration
 */

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { tasksCommand } from './commands/tasks.js';
import { contextCommand } from './commands/context.js';
import { serveCommand } from './commands/serve.js';
import { validateCommand } from './commands/validate.js';
import { agentCommand, runAgentMode } from './commands/agent.js';
import { updateCommand } from './commands/update.js';
import { gatewayCommand } from './commands/gateway.js';
import { creditsCommand } from './commands/credits.js';
import { getConfigPath } from './utils/config.js';

// Read version from package.json
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('openpaean')
  .description('OpenPaean - Open source AI agent with scrolling TUI, MCP integration and gateway mode')
  .version(packageJson.version)
  .option('--config', 'Show config file path')
  .option('--no-mcp', 'Disable local MCP server integration')
  .option('--fullscreen', 'Enable fullscreen mode (default: scrolling mode)')
  .option('-d, --debug', 'Enable debug logging')
  .option('-m, --message <message>', 'Send a single message to agent')
  .option('--gateway', 'Enable gateway relay for remote clients')
  .option('--gateway-interval <ms>', 'Gateway poll interval in milliseconds', '3000')
  .action(async (options) => {
    if (options.config) {
      console.log(getConfigPath());
      return;
    }

    await runAgentMode({
      mcp: options.mcp !== false,
      fullscreen: options.fullscreen === true,
      debug: options.debug,
      message: options.message,
      gatewayEnabled: options.gateway ?? false,
      gatewayPollInterval: parseInt(options.gatewayInterval, 10) || 3000,
    });
  });

// Register commands
program.addCommand(agentCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(tasksCommand);
program.addCommand(contextCommand);
program.addCommand(serveCommand);
program.addCommand(validateCommand);
program.addCommand(gatewayCommand);
program.addCommand(creditsCommand);
program.addCommand(updateCommand);

// Parse arguments
program.parse();
