/**
 * Agent Module Index
 * Export agent functionality
 */

export { AgentService, agentService } from './service.js';
export { startChat, sendMessage } from './chat.ink.js';
export {
    renderMarkdown,
    renderToolCall,
    renderToolResult,
    renderMcpToolCall,
    renderMcpToolResult,
    renderError,
    renderSuccess,
    renderPrompt,
    renderAgentLabel,
    renderWelcome,
    renderGoodbye,
    renderThinking,
} from './renderer.js';
export {
    createThinkingSpinner,
    createToolCallSpinner,
    createMcpSpinner,
    createLoadingSpinner,
} from './spinner.js';
export type { SpinnerController, SpinnerType } from './spinner.js';
export {
    commandCompleter,
    renderCommandHelp,
    COMMANDS,
    getAllCommandNames,
    isCommand,
    getCommandDef,
} from './completer.js';
export type { CommandDef } from './completer.js';
export {
    CLI_MODE_PROMPT,
    DEFAULT_CLI_MODE,
    createCliModeConfig,
    isCliModeActive,
    isRawStreamEnabled,
} from './cli-mode.js';
export type { CliModeOptions } from './cli-mode.js';
export type {
    AgentStreamEvent,
    AgentStreamCallbacks,
    McpState,
    McpToolResult,
    McpContentItem,
    McpServerStatus,
    McpToolInfo,
} from './types.js';
