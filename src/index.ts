/**
 * Paean CLI - Public API
 * Export functions for programmatic usage
 */

// API Client
export { createApiClient, getApiClient, getPublicApiClient } from './api/client.js';

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

