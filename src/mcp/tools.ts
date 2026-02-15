/**
 * MCP Tools
 * Define tools that AI agents can execute
 * 
 * This module combines:
 * - System tools (shell, filesystem, process management)
 * - Task management tools (CRUD for tasks and subtasks)
 * - Custom MCP tools (registered via registerCustomTools for extensibility)
 * 
 * Open Source MCP Extensibility:
 * Developers can register custom tools using registerCustomTools() to extend
 * the MCP server with project-specific or domain-specific capabilities.
 * See also: loadCustomToolsFromJson() for JSON-defined local MCP tools.
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  completeTodoItem,
  createTodoItem,
  updateTodoItem,
  getTodoList,
  acceptPendingChange,
  rejectPendingChange,
  addSubtask,
  completeSubtask,
  updateSubtask,
  deleteSubtask,
  getSubtaskProgress,
} from '../api/todo.js';
import { detectProject, getProjectId } from '../utils/project.js';
import { getSystemTools, executeSystemTool } from './system.js';

/** System tool names that must be routed to executeSystemTool */
const SYSTEM_TOOL_NAMES = new Set([
  'paean_execute_shell',
  'paean_check_process',
  'paean_kill_process',
  'paean_download_file',
  'paean_write_file',
  'paean_read_file',
  'paean_list_directory',
]);

// ============================================
// Custom MCP Tool Registry (Open Source Extensibility)
// ============================================

/**
 * Custom tool handler type
 * Implement this to create your own MCP tools
 */
export type CustomToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

/** Registry for custom MCP tools */
const customToolRegistry = new Map<string, { tool: Tool; handler: CustomToolHandler }>();

/**
 * Register custom MCP tools programmatically.
 * 
 * This is the primary extensibility point for open-source MCP customization.
 * Registered tools will appear alongside built-in tools when listing MCP tools.
 * 
 * @example
 * ```typescript
 * import { registerCustomTools } from 'openpaean';
 * 
 * registerCustomTools([{
 *   tool: {
 *     name: 'my_custom_tool',
 *     description: 'Does something cool',
 *     inputSchema: {
 *       type: 'object',
 *       properties: {
 *         input: { type: 'string', description: 'The input value' }
 *       },
 *       required: ['input']
 *     }
 *   },
 *   handler: async (args) => {
 *     return { success: true, result: `Processed: ${args.input}` };
 *   }
 * }]);
 * ```
 */
export function registerCustomTools(
  tools: Array<{ tool: Tool; handler: CustomToolHandler }>
): void {
  for (const { tool, handler } of tools) {
    customToolRegistry.set(tool.name, { tool, handler });
  }
}

/**
 * Unregister a custom MCP tool by name
 */
export function unregisterCustomTool(toolName: string): boolean {
  return customToolRegistry.delete(toolName);
}

/**
 * Load custom MCP tools from a JSON definition file.
 * 
 * JSON format for defining local MCP tools:
 * ```json
 * {
 *   "tools": [
 *     {
 *       "name": "my_tool",
 *       "description": "Description of my tool",
 *       "inputSchema": { ... },
 *       "command": "node ./scripts/my-tool.js"
 *     }
 *   ]
 * }
 * ```
 * 
 * Each tool defined in JSON will be executed as a shell command,
 * with the tool arguments passed as JSON via stdin.
 */
export async function loadCustomToolsFromJson(jsonPath: string): Promise<number> {
  const { readFile } = await import('fs/promises');
  const { resolve } = await import('path');
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  const resolvedPath = resolve(jsonPath);

  try {
    const content = await readFile(resolvedPath, 'utf-8');
    const config = JSON.parse(content) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: Record<string, unknown>;
        command: string;
        cwd?: string;
        timeout?: number;
      }>;
    };

    if (!config.tools || !Array.isArray(config.tools)) {
      return 0;
    }

    const toolEntries: Array<{ tool: Tool; handler: CustomToolHandler }> = [];

    for (const def of config.tools) {
      if (!def.name || !def.command) continue;

      const tool: Tool = {
        name: def.name,
        description: def.description || `Custom tool: ${def.name}`,
        inputSchema: {
          type: 'object',
          properties: (def.inputSchema?.properties || {}) as Record<string, object>,
          ...(def.inputSchema?.required ? { required: def.inputSchema.required as string[] } : {}),
        },
      };

      const command = def.command;
      const cwd = def.cwd;
      const timeout = def.timeout || 60000;

      const handler: CustomToolHandler = async (args) => {
        try {
          const input = JSON.stringify(args);
          const { stdout, stderr } = await execAsync(command, {
            cwd: cwd || process.cwd(),
            timeout,
            maxBuffer: 5 * 1024 * 1024,
            env: {
              ...process.env,
              MCP_TOOL_INPUT: input,
              MCP_TOOL_NAME: def.name,
            },
          });

          // Try to parse stdout as JSON
          try {
            return JSON.parse(stdout.trim());
          } catch {
            return {
              success: true,
              output: stdout.trim(),
              stderr: stderr.trim() || undefined,
            };
          }
        } catch (error) {
          const err = error as { message?: string; stdout?: string; stderr?: string };
          return {
            success: false,
            error: err.message || 'Custom tool execution failed',
            stdout: err.stdout?.trim(),
            stderr: err.stderr?.trim(),
          };
        }
      };

      toolEntries.push({ tool, handler });
    }

    registerCustomTools(toolEntries);
    return toolEntries.length;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return 0; // File not found is not an error, just no custom tools
    }
    throw error;
  }
}

/**
 * Get available MCP tools (including system tools and custom tools)
 */
export function getMcpTools(): Tool[] {
  return [
    // System/Shell tools (open source)
    ...getSystemTools(),
    // Custom registered tools
    ...Array.from(customToolRegistry.values()).map(({ tool }) => tool),
    // Task management tools
    {
      name: 'paean_complete_task',
      description:
        'Mark a task as completed. Call this after successfully completing a task.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the task to complete',
          },
          summary: {
            type: 'string',
            description: 'A brief summary of what was done to complete the task',
          },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'paean_create_task',
      description:
        'Create a new task. Use this when you discover additional work that needs to be done. Supports creating tasks with subtasks for complex multi-step work.',
      inputSchema: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: 'The task description/title',
          },
          description: {
            type: 'string',
            description: 'Additional notes or details about the task',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Task priority level',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional tags to categorize the task',
          },
          sourceContext: {
            type: 'string',
            description: 'Context about why this task was created',
          },
          subtasks: {
            type: 'array',
            items: { type: 'string' },
            description: 'List of subtask contents. Use this to break down complex tasks into smaller steps.',
          },
        },
        required: ['content'],
      },
    },
    {
      name: 'paean_update_task',
      description: 'Update an existing task (status, priority, or content)',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the task to update',
          },
          status: {
            type: 'string',
            enum: ['pending', 'in_progress'],
            description: 'New task status',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'New task priority',
          },
          content: {
            type: 'string',
            description: 'Updated task content',
          },
        },
        required: ['taskId'],
      },
    },
    {
      name: 'paean_list_tasks',
      description: 'List tasks with optional filtering',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['all', 'pending', 'in_progress', 'completed'],
            description: 'Filter by task status',
          },
          priority: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Filter by priority',
          },
        },
      },
    },
    {
      name: 'paean_accept_change',
      description: 'Accept a pending AI-suggested change',
      inputSchema: {
        type: 'object',
        properties: {
          changeId: {
            type: 'number',
            description: 'The ID of the pending change to accept',
          },
        },
        required: ['changeId'],
      },
    },
    {
      name: 'paean_reject_change',
      description: 'Reject a pending AI-suggested change',
      inputSchema: {
        type: 'object',
        properties: {
          changeId: {
            type: 'number',
            description: 'The ID of the pending change to reject',
          },
          reason: {
            type: 'string',
            description: 'Reason for rejecting the change',
          },
        },
        required: ['changeId'],
      },
    },
    // Subtask management tools
    {
      name: 'paean_add_subtask',
      description: 'Add a subtask (checklist item) to an existing task. Use this to break down a task into smaller steps.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the parent task to add the subtask to',
          },
          content: {
            type: 'string',
            description: 'The subtask description',
          },
        },
        required: ['taskId', 'content'],
      },
    },
    {
      name: 'paean_complete_subtask',
      description: 'Mark a subtask as completed. Use this when a specific subtask/checklist item is done.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the parent task',
          },
          subtaskId: {
            type: 'string',
            description: 'The ID of the subtask to complete',
          },
        },
        required: ['taskId', 'subtaskId'],
      },
    },
    {
      name: 'paean_update_subtask',
      description: 'Update a subtask content or completion status.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the parent task',
          },
          subtaskId: {
            type: 'string',
            description: 'The ID of the subtask to update',
          },
          content: {
            type: 'string',
            description: 'New content for the subtask',
          },
          completed: {
            type: 'boolean',
            description: 'Set completion status (true=done, false=not done)',
          },
        },
        required: ['taskId', 'subtaskId'],
      },
    },
    {
      name: 'paean_delete_subtask',
      description: 'Delete a subtask from a task.',
      inputSchema: {
        type: 'object',
        properties: {
          taskId: {
            type: 'string',
            description: 'The ID of the parent task',
          },
          subtaskId: {
            type: 'string',
            description: 'The ID of the subtask to delete',
          },
        },
        required: ['taskId', 'subtaskId'],
      },
    },
  ];
}

/**
 * Execute an MCP tool
 */
export async function executeMcpTool(
  toolName: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const project = detectProject();
  const projectId = getProjectId(project);

  switch (toolName) {
    case 'paean_complete_task': {
      const taskId = args.taskId as string;
      const summary = args.summary as string | undefined;

      if (!taskId) {
        return {
          success: false,
          error: 'taskId is required',
        };
      }

      try {
        const result = await completeTodoItem(taskId, summary);
        return {
          success: true,
          message: 'Task completed successfully',
          task: {
            id: result.data.id,
            content: result.data.content,
            status: result.data.status,
          },
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to complete task',
        };
      }
    }

    case 'paean_create_task': {
      const content = args.content as string;
      const description = args.description as string | undefined;
      const priority = (args.priority as 'high' | 'medium' | 'low') || 'medium';
      const tags = args.tags as string[] | undefined;
      const sourceContext = args.sourceContext as string | undefined;
      const subtasks = args.subtasks as string[] | undefined;

      if (!content) {
        return {
          success: false,
          error: 'content is required',
        };
      }

      try {
        const result = await createTodoItem({
          content,
          description,
          priority,
          tags,
          sourceContext,
          subtasks,
        });
        
        const subtaskInfo = subtasks?.length 
          ? ` with ${subtasks.length} subtask(s)` 
          : '';

        return {
          success: true,
          message: `Task created successfully${subtaskInfo}`,
          task: {
            id: result.data.id,
            content: result.data.content,
            description: result.data.description,
            priority: result.data.priority,
            status: result.data.status,
            subtaskCount: result.data.checklist?.length || 0,
          },
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create task',
        };
      }
    }

    case 'paean_update_task': {
      const taskId = args.taskId as string;
      const updates: Record<string, unknown> = {};

      if (args.status) updates.status = args.status;
      if (args.priority) updates.priority = args.priority;
      if (args.content) updates.content = args.content;

      if (!taskId) {
        return {
          success: false,
          error: 'taskId is required',
        };
      }

      if (Object.keys(updates).length === 0) {
        return {
          success: false,
          error: 'At least one update field is required (status, priority, or content)',
        };
      }

      try {
        const result = await updateTodoItem(taskId, updates);
        return {
          success: true,
          message: 'Task updated successfully',
          task: {
            id: result.data.id,
            content: result.data.content,
            priority: result.data.priority,
            status: result.data.status,
          },
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update task',
        };
      }
    }

    case 'paean_list_tasks': {
      const status = args.status as string | undefined;
      const priority = args.priority as string | undefined;

      try {
        const result = await getTodoList({
          status: status as 'all' | 'pending' | 'completed' | 'in_progress' | 'cancelled' | undefined,
          priority: priority as 'high' | 'medium' | 'low' | undefined,
        });

        return {
          success: true,
          tasks: result.data.items.map((t) => {
            const progress = getSubtaskProgress(t);
            return {
              id: t.id,
              content: t.content,
              description: t.description,
              priority: t.priority,
              status: t.status,
              tags: t.tags,
              dueDate: t.dueDate,
              // Subtask information
              hasSubtasks: progress.total > 0,
              subtaskCount: progress.total,
              subtasksCompleted: progress.completed,
              subtaskProgress: progress.percentage,
              subtasks: t.checklist?.map(s => ({
                id: s.id,
                content: s.content,
                completed: s.completed,
              })) || [],
            };
          }),
          stats: result.data.stats,
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to list tasks',
        };
      }
    }

    case 'paean_accept_change': {
      const changeId = args.changeId as number;

      if (!changeId) {
        return {
          success: false,
          error: 'changeId is required',
        };
      }

      try {
        await acceptPendingChange(changeId);
        return {
          success: true,
          message: 'Change accepted successfully',
          changeId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to accept change',
        };
      }
    }

    case 'paean_reject_change': {
      const changeId = args.changeId as number;
      const reason = args.reason as string | undefined;

      if (!changeId) {
        return {
          success: false,
          error: 'changeId is required',
        };
      }

      try {
        await rejectPendingChange(changeId, reason);
        return {
          success: true,
          message: 'Change rejected successfully',
          changeId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reject change',
        };
      }
    }

    // Subtask management tools
    case 'paean_add_subtask': {
      const taskId = args.taskId as string;
      const content = args.content as string;

      if (!taskId || !content) {
        return {
          success: false,
          error: 'taskId and content are required',
        };
      }

      try {
        const result = await addSubtask(taskId, content);
        return {
          success: true,
          message: 'Subtask added successfully',
          taskId,
          subtaskId: result.subtaskId,
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add subtask',
        };
      }
    }

    case 'paean_complete_subtask': {
      const taskId = args.taskId as string;
      const subtaskId = args.subtaskId as string;

      if (!taskId || !subtaskId) {
        return {
          success: false,
          error: 'taskId and subtaskId are required',
        };
      }

      try {
        const result = await completeSubtask(taskId, subtaskId);
        const progress = getSubtaskProgress(result.data);
        
        return {
          success: true,
          message: `Subtask completed! Progress: ${progress.completed}/${progress.total} (${progress.percentage}%)`,
          taskId,
          subtaskId,
          progress: {
            completed: progress.completed,
            total: progress.total,
            percentage: progress.percentage,
          },
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to complete subtask',
        };
      }
    }

    case 'paean_update_subtask': {
      const taskId = args.taskId as string;
      const subtaskId = args.subtaskId as string;
      const content = args.content as string | undefined;
      const completed = args.completed as boolean | undefined;

      if (!taskId || !subtaskId) {
        return {
          success: false,
          error: 'taskId and subtaskId are required',
        };
      }

      if (content === undefined && completed === undefined) {
        return {
          success: false,
          error: 'At least one of content or completed must be provided',
        };
      }

      try {
        const updates: { content?: string; completed?: boolean } = {};
        if (content !== undefined) updates.content = content;
        if (completed !== undefined) updates.completed = completed;

        await updateSubtask(taskId, subtaskId, updates);
        return {
          success: true,
          message: 'Subtask updated successfully',
          taskId,
          subtaskId,
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update subtask',
        };
      }
    }

    case 'paean_delete_subtask': {
      const taskId = args.taskId as string;
      const subtaskId = args.subtaskId as string;

      if (!taskId || !subtaskId) {
        return {
          success: false,
          error: 'taskId and subtaskId are required',
        };
      }

      try {
        await deleteSubtask(taskId, subtaskId);
        return {
          success: true,
          message: 'Subtask deleted successfully',
          taskId,
          subtaskId,
          project: project.name,
          projectId,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Failed to delete subtask',
        };
      }
    }

    default: {
      // Check if it's a system tool (shell, filesystem, process)
      if (SYSTEM_TOOL_NAMES.has(toolName)) {
        return executeSystemTool(toolName, args);
      }
      // Check if it's a custom registered tool
      const customEntry = customToolRegistry.get(toolName);
      if (customEntry) {
        return customEntry.handler(args);
      }
      return {
        success: false,
        error: `Unknown tool: ${toolName}`,
      };
    }
  }
}
