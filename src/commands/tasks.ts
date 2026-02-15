/**
 * Tasks Command
 * View and manage todo tasks
 */

import { Command } from 'commander';
import {
  getTodoList,
  createTodoItem,
  completeTodoItem,
  updateTodoItem,
  deleteTodoItem,
  getPendingChanges,
  acceptPendingChange,
  rejectPendingChange,
  type TodoItem,
} from '../api/todo.js';
import { isAuthenticated } from '../utils/config.js';
import * as output from '../utils/output.js';

export const tasksCommand = new Command('tasks')
  .description('View and manage tasks')
  .option('--json', 'Output in JSON format')
  .option('--status <status>', 'Filter by status (pending, completed, in_progress, cancelled, all)')
  .option('--priority <priority>', 'Filter by priority (high, medium, low)')
  .action(async (options) => {
    requireAuth();

    const spin = output.spinner('Fetching tasks...').start();

    try {
      const response = await getTodoList({
        status: options.status,
        priority: options.priority,
      });

      spin.stop();

      if (options.json) {
        output.json(response.data);
        return;
      }

      const { items, stats } = response.data;

      output.header('Tasks');

      // Show stats
      output.tableRow('Total', String(stats.total), 15);
      output.tableRow('Pending', String(stats.pending), 15);
      output.tableRow('Completed', String(stats.completed), 15);
      if (stats.overdue) {
        output.tableRow('Overdue', output.colors.error(String(stats.overdue)), 15);
      }
      if (stats.dueToday) {
        output.tableRow('Due Today', output.colors.warning(String(stats.dueToday)), 15);
      }

      output.newline();

      if (items.length === 0) {
        output.dim('No tasks found.');
        return;
      }

      // Group by status
      const pending = items.filter((t) => t.status === 'pending' || t.status === 'in_progress');
      const completed = items.filter((t) => t.status === 'completed');

      if (pending.length > 0) {
        output.info(`Pending (${pending.length}):`);
        for (const task of pending) {
          printTask(task);
        }
        output.newline();
      }

      if (completed.length > 0 && (!options.status || options.status === 'all')) {
        output.dim(`Recently Completed (${Math.min(completed.length, 5)}):`);
        for (const task of completed.slice(0, 5)) {
          printTask(task);
        }
      }
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks add
tasksCommand
  .command('add <content>')
  .description('Create a new task')
  .option('-p, --priority <priority>', 'Priority (high, medium, low)', 'medium')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('--json', 'Output in JSON format')
  .action(async (content: string, options) => {
    requireAuth();

    const spin = output.spinner('Creating task...').start();

    try {
      const response = await createTodoItem({
        content,
        priority: options.priority as 'high' | 'medium' | 'low',
        tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
      });

      spin.stop();

      if (options.json) {
        output.json(response.data);
        return;
      }

      output.success('Task created');
      printTask(response.data);
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks complete
tasksCommand
  .command('complete <id>')
  .description('Mark a task as completed')
  .option('-s, --summary <summary>', 'Completion summary')
  .option('--json', 'Output in JSON format')
  .action(async (id: string, options) => {
    requireAuth();

    const spin = output.spinner('Completing task...').start();

    try {
      const response = await completeTodoItem(id, options.summary);
      spin.stop();

      if (options.json) {
        output.json(response.data);
        return;
      }

      output.success('Task completed');
      printTask(response.data);
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks update
tasksCommand
  .command('update <id>')
  .description('Update a task')
  .option('-c, --content <content>', 'New content')
  .option('-p, --priority <priority>', 'Priority (high, medium, low)')
  .option('-s, --status <status>', 'Status (pending, in_progress)')
  .option('--json', 'Output in JSON format')
  .action(async (id: string, options) => {
    requireAuth();

    const updates: Partial<TodoItem> = {};
    if (options.content) updates.content = options.content;
    if (options.priority) updates.priority = options.priority;
    if (options.status) updates.status = options.status;

    if (Object.keys(updates).length === 0) {
      output.error('No updates specified. Use --content, --priority, or --status.');
      process.exit(1);
    }

    const spin = output.spinner('Updating task...').start();

    try {
      const response = await updateTodoItem(id, updates);
      spin.stop();

      if (options.json) {
        output.json(response.data);
        return;
      }

      output.success('Task updated');
      printTask(response.data);
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks delete
tasksCommand
  .command('delete <id>')
  .description('Delete a task')
  .action(async (id: string) => {
    requireAuth();

    const spin = output.spinner('Deleting task...').start();

    try {
      await deleteTodoItem(id);
      spin.stop();
      output.success('Task deleted');
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks pending
tasksCommand
  .command('pending')
  .description('View pending AI-suggested changes')
  .option('--json', 'Output in JSON format')
  .option('--all', 'Show all changes including processed ones')
  .action(async (options) => {
    requireAuth();

    const spin = output.spinner('Fetching pending changes...').start();

    try {
      const response = await getPendingChanges(options.all ? 'all' : 'pending');
      spin.stop();

      if (options.json) {
        output.json(response.data);
        return;
      }

      if (response.data.length === 0) {
        output.info('No pending changes.');
        return;
      }

      output.header('Pending Changes');

      for (const change of response.data) {
        output.newline();
        output.info(`#${change.id} - ${change.summary}`);
        output.tableRow('Status', change.status, 15);
        output.tableRow('Changes', String(change.changeCount), 15);
        output.tableRow(
          'Operations',
          `+${change.operationCounts.add} ~${change.operationCounts.update} ✓${change.operationCounts.complete}`,
          15
        );
        if (change.sourceNoteTitle) {
          output.tableRow('Source', output.truncate(change.sourceNoteTitle, 40), 15);
        }
        output.tableRow('Created', output.formatDate(change.createdAt), 15);
        if (change.isExpired) {
          output.dim('  (expired)');
        }
      }

      output.newline();
      output.dim('Use "openpaean tasks accept <id>" or "openpaean tasks reject <id>" to process.');
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks accept
tasksCommand
  .command('accept <changeId>')
  .description('Accept a pending change')
  .action(async (changeId: string) => {
    requireAuth();

    const spin = output.spinner('Accepting change...').start();

    try {
      await acceptPendingChange(parseInt(changeId, 10));
      spin.stop();
      output.success('Change accepted');
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Subcommand: tasks reject
tasksCommand
  .command('reject <changeId>')
  .description('Reject a pending change')
  .option('-n, --notes <notes>', 'Rejection notes')
  .action(async (changeId: string, options) => {
    requireAuth();

    const spin = output.spinner('Rejecting change...').start();

    try {
      await rejectPendingChange(parseInt(changeId, 10), options.notes);
      spin.stop();
      output.success('Change rejected');
    } catch (error) {
      spin.stop();
      handleError(error);
    }
  });

// Helper functions
function requireAuth(): void {
  if (!isAuthenticated()) {
    output.error('Not authenticated. Please run "openpaean login" first.');
    process.exit(1);
  }
}

function printTask(task: TodoItem): void {
  const status = output.formatStatus(task.status);
  const priority = output.formatPriority(task.priority);
  const content = output.truncate(task.content, 60);

  // Show full task ID - users need it for complete/update/delete commands
  output.listItem(`${output.colors.dim(`[${task.id}]`)} ${content}`);
  output.dim(`      ${status} | ${priority}`);

  if (task.tags && task.tags.length > 0) {
    output.dim(`      Tags: ${task.tags.join(', ')}`);
  }
  if (task.dueDate) {
    output.dim(`      Due: ${output.formatDate(task.dueDate)}`);
  }
}

function handleError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Unknown error';
  output.error(message);
  process.exit(1);
}
