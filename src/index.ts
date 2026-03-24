/**
 * OpenPaean CLI - Public API
 * Export functions for programmatic usage
 */

// API Client
export { createApiClient, createNonClearingApiClient, getApiClient, getPublicApiClient } from './api/client.js';

// Authentication
export {
  qrLogin,
  browserLogin,
  getCurrentUser,
  validateToken,
  logout,
  type LoginResponse,
  type UserInfo,
} from './api/auth.js';

// Todo API
export {
  getTodoList,
  getTodoItem,
  createTodoItem,
  updateTodoItem,
  completeTodoItem,
  reopenTodoItem,
  deleteTodoItem,
  getPendingChanges,
  acceptPendingChange,
  rejectPendingChange,
  getTodoPreferences,
  updateTodoPreferences,
  analyzeTodos,
  type TodoItem,
  type TodoListResponse,
  type PendingChange,
  type TodoPreferences,
} from './api/todo.js';

// Credits & Deposit API
export {
  getCreditsStatus,
  getDepositInfo,
  pollDeposits,
  getDepositHistory,
  getDepositStatus,
  type CreditsStatus,
  type DepositInfo,
  type NetworkDepositInfo,
  type DepositRecord,
  type PollResult,
  type DepositStatusResult,
} from './api/credits.js';

// Configuration
export {
  getConfig,
  getConfigValue,
  setConfigValue,
  setConfig,
  isAuthenticated,
  getToken,
  getApiUrl,
  getWebUrl,
  storeAuth,
  clearAuth,
  getConfigPath,
  getConfigDir,
  type PaeanConfig,
} from './utils/config.js';

// Project detection
export {
  detectProject,
  getProjectId,
  isInProject,
  type ProjectContext,
} from './utils/project.js';

// MCP Server
export { startMcpServer, type McpServerOptions } from './mcp/server.js';
export { getMcpResources, readMcpResource } from './mcp/resources.js';
export {
  getMcpTools,
  executeMcpTool,
  registerCustomTools,
  unregisterCustomTool,
  loadCustomToolsFromJson,
  type CustomToolHandler,
} from './mcp/tools.js';

// System Tools (shell, filesystem, process)
export {
  getSystemTools,
  executeSystemTool,
  isCommandWhitelisted,
  isDangerousCommand,
  getCommandWhitelist,
} from './mcp/system.js';

// Loop Tools (session-scoped, prompt-injection based recurring tasks)
export {
  getLoopToolDefinitions,
  executeLoopTool,
  LOOP_TOOL_NAMES,
  getActiveLoopCount,
  clearAllLoopJobs,
  onLoopPrompt,
  setAgentBusyChecker,
  type LoopJob,
  type LoopPromptEvent,
  // Legacy aliases
  getCronToolDefinitions,
  executeCronTool,
  CRON_TOOL_NAMES,
  getActiveCronCount,
  clearAllCronJobs,
  onCronPrompt,
  type CronJob,
  type CronPromptEvent,
} from './mcp/loop.js';

// CLI Agent Tools (invoke external coding CLIs)
export {
  getCliAgentTools,
  executeCliAgentTool,
  type CliAgentType,
} from './mcp/cli-agents.js';

// MCP Client (for local MCP server integration)
export { McpClient } from './mcp/client.js';

// Agent Mode
export {
  AgentService,
  agentService,
  startChat,
  sendMessage,
  renderMarkdown,
  type AgentStreamEvent,
  type AgentStreamCallbacks,
  type McpState,
  type McpToolResult,
} from './agent/index.js';

// Gateway (cross-device relay)
export {
  GatewayService,
  getGateway,
  resetGateway,
  type GatewayConfig,
  type GatewayState,
  type GatewayEvent,
  type GatewayStatus,
} from './gateway/service.js';

