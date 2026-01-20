/**
 * Validate Command
 * Check if current changes satisfy pending tasks
 */

import { Command } from 'commander';
import { getTodoList, completeTodoItem, type TodoItem } from '../api/todo.js';
import { isAuthenticated } from '../utils/config.js';
import { detectProject } from '../utils/project.js';
import * as output from '../utils/output.js';

export const validateCommand = new Command('validate')
  .description('Check if current changes satisfy pending tasks')
  .option('--auto-complete', 'Automatically mark validated tasks as complete')
  .option('--json', 'Output validation results as JSON')
  .action(async (options) => {
    if (!isAuthenticated()) {
      output.error('Not authenticated. Please run "paean login" first.');
      process.exit(1);
    }

    const spin = output.spinner('Validating tasks...').start();

    try {
      const project = detectProject();
      const todoResponse = await getTodoList({ status: 'pending' });

      spin.stop();

      const pendingTasks = todoResponse.data.items.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress'
      );

      if (pendingTasks.length === 0) {
        output.success('No pending tasks to validate.');
        return;
      }

      output.header('Task Validation');
      output.dim(`Project: ${project.name}`);
      output.newline();

      const validationResults: Array<{
        task: TodoItem;
        validated: boolean;
        reason: string;
      }> = [];

      // For each pending task, check if it might be complete
      // This is a basic check - more sophisticated validation could be added
      for (const task of pendingTasks) {
        const result = await validateTask(task, project);
        validationResults.push(result);

        const icon = result.validated ? output.colors.success('✓') : output.colors.dim('○');
        output.listItem(`${icon} ${output.truncate(task.content, 50)}`);
        output.dim(`      ${result.reason}`);

        if (result.validated && options.autoComplete) {
          try {
            await completeTodoItem(task.id, result.reason);
            output.success(`      → Marked as complete`);
          } catch (error) {
            output.error(`      → Failed to mark complete`);
          }
        }

        output.newline();
      }

      if (options.json) {
        output.json(validationResults);
        return;
      }

      // Summary
      const validatedCount = validationResults.filter((r) => r.validated).length;
      output.newline();
      output.tableRow('Total Tasks', String(pendingTasks.length), 20);
      output.tableRow('Validated', String(validatedCount), 20);
      output.tableRow('Remaining', String(pendingTasks.length - validatedCount), 20);

      if (validatedCount > 0 && !options.autoComplete) {
        output.newline();
        output.dim('Use --auto-complete to automatically mark validated tasks as complete.');
      }
    } catch (error) {
      spin.stop();
      const message = error instanceof Error ? error.message : 'Unknown error';
      output.error(`Validation failed: ${message}`);
      process.exit(1);
    }
  });

interface ProjectContext {
  name: string;
  type?: string;
  path: string;
  hasGit?: boolean;
}

async function validateTask(
  task: TodoItem,
  _project: ProjectContext
): Promise<{
  task: TodoItem;
  validated: boolean;
  reason: string;
}> {
  // Basic validation logic
  // In a more sophisticated implementation, this could:
  // 1. Check git diff for related changes
  // 2. Run tests
  // 3. Check for specific file patterns
  // 4. Use AI to analyze changes

  // For now, we do basic keyword matching and status checks
  const content = task.content.toLowerCase();

  // Check if task appears to be documentation-related
  if (content.includes('document') || content.includes('readme') || content.includes('doc')) {
    // Could check if README was modified
    return {
      task,
      validated: false,
      reason: 'Documentation tasks require manual verification',
    };
  }

  // Check if task is a bug fix
  if (content.includes('fix') || content.includes('bug') || content.includes('error')) {
    return {
      task,
      validated: false,
      reason: 'Bug fixes require testing to validate',
    };
  }

  // Check if task is about adding a feature
  if (content.includes('add') || content.includes('implement') || content.includes('create')) {
    return {
      task,
      validated: false,
      reason: 'Feature additions require code review',
    };
  }

  // If task is in_progress, it might be partially done
  if (task.status === 'in_progress') {
    return {
      task,
      validated: false,
      reason: 'Task is still in progress',
    };
  }

  // Default: cannot automatically validate
  return {
    task,
    validated: false,
    reason: 'Requires manual verification',
  };
}
