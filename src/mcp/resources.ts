/**
 * MCP Resources
 * Define resources that AI agents can read
 */

import { type Resource } from '@modelcontextprotocol/sdk/types.js';
import { getTodoList, getPendingChanges, getSubtaskProgress } from '../api/todo.js';
import { detectProject, getProjectId } from '../utils/project.js';
import { getConfigValue } from '../utils/config.js';

/**
 * Get available MCP resources
 */
export async function getMcpResources(): Promise<Resource[]> {
  const project = detectProject();

  return [
    {
      uri: 'paean://tasks/pending',
      name: 'Pending Tasks',
      description: `Current pending tasks for ${project.name}`,
      mimeType: 'application/json',
    },
    {
      uri: 'paean://tasks/completed',
      name: 'Completed Tasks',
      description: 'Recently completed tasks',
      mimeType: 'application/json',
    },
    {
      uri: 'paean://tasks/all',
      name: 'All Tasks',
      description: 'All tasks with full details',
      mimeType: 'application/json',
    },
    {
      uri: 'paean://context',
      name: 'Project Context',
      description: 'Full project context including tasks and metadata',
      mimeType: 'application/json',
    },
    {
      uri: 'paean://pending-changes',
      name: 'Pending Changes',
      description: 'AI-suggested task changes awaiting review',
      mimeType: 'application/json',
    },
  ];
}

/**
 * Read a specific MCP resource
 */
export async function readMcpResource(uri: string): Promise<unknown> {
  const project = detectProject();
  const projectId = getProjectId(project);

  switch (uri) {
    case 'paean://tasks/pending': {
      const response = await getTodoList();
      const pendingTasks = response.data.items.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress'
      );
      return {
        project: project.name,
        projectId,
        tasks: pendingTasks.map((t) => {
          const progress = getSubtaskProgress(t);
          return {
            id: t.id,
            content: t.content,
            description: t.description,
            priority: t.priority,
            status: t.status,
            tags: t.tags,
            dueDate: t.dueDate,
            createdAt: t.createdAt,
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
        count: pendingTasks.length,
        retrievedAt: new Date().toISOString(),
      };
    }

    case 'paean://tasks/completed': {
      const response = await getTodoList({ status: 'completed' });
      const completedTasks = response.data.items.slice(0, 10); // Last 10 completed
      return {
        project: project.name,
        projectId,
        tasks: completedTasks.map((t) => ({
          id: t.id,
          content: t.content,
          priority: t.priority,
          completedAt: t.updatedAt,
        })),
        count: completedTasks.length,
        retrievedAt: new Date().toISOString(),
      };
    }

    case 'paean://tasks/all': {
      const response = await getTodoList();
      return {
        project: project.name,
        projectId,
        tasks: response.data.items,
        stats: response.data.stats,
        retrievedAt: new Date().toISOString(),
      };
    }

    case 'paean://context': {
      const todoResponse = await getTodoList();
      const pendingChanges = await getPendingChanges();

      const pendingTasks = todoResponse.data.items.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress'
      );
      const recentCompleted = todoResponse.data.items
        .filter((t) => t.status === 'completed')
        .slice(0, 5);

      return {
        project: {
          name: project.name,
          type: project.type,
          path: project.path,
          id: projectId,
          gitBranch: project.gitBranch,
        },
        user: {
          email: getConfigValue('email'),
        },
        tasks: {
          pending: pendingTasks.map((t) => {
            const progress = getSubtaskProgress(t);
            return {
              id: t.id,
              content: t.content,
              description: t.description,
              priority: t.priority,
              status: t.status,
              tags: t.tags,
              dueDate: t.dueDate,
              sourceContext: t.sourceContext,
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
          recentlyCompleted: recentCompleted.map((t) => ({
            id: t.id,
            content: t.content,
            completedAt: t.updatedAt,
          })),
          stats: todoResponse.data.stats,
        },
        pendingChanges: pendingChanges.data.filter((c) => !c.isExpired).length,
        instructions: {
          onComplete:
            'After completing a task, call the paean_complete_task tool with the task ID and a brief summary.',
          onNewTask:
            'If you discover additional work needed, call the paean_create_task tool. You can include subtasks array to break down complex tasks.',
          onSubtaskComplete:
            'After completing a subtask, call the paean_complete_subtask tool with the task ID and subtask ID.',
          priority:
            'Focus on high priority tasks first, then medium, then low.',
        },
        retrievedAt: new Date().toISOString(),
      };
    }

    case 'paean://pending-changes': {
      const response = await getPendingChanges();
      return {
        project: project.name,
        projectId,
        changes: response.data.map((c) => ({
          id: c.id,
          summary: c.summary,
          status: c.status,
          changeCount: c.changeCount,
          operations: c.operationCounts,
          sourceNote: c.sourceNoteTitle,
          createdAt: c.createdAt,
          isExpired: c.isExpired,
        })),
        count: response.data.length,
        pendingCount: response.data.filter((c) => c.status === 'pending' && !c.isExpired).length,
        retrievedAt: new Date().toISOString(),
      };
    }

    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
}
