/**
 * Context Command
 * Generate context file for AI agents
 */

import { Command } from 'commander';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { getTodoList, getPendingChanges, type TodoItem } from '../api/todo.js';
import { isAuthenticated, getConfigValue } from '../utils/config.js';
import { detectProject, getProjectId } from '../utils/project.js';
import * as output from '../utils/output.js';

export const contextCommand = new Command('context')
  .description('Generate context file for AI agents')
  .option('-o, --output <path>', 'Output file path', '.paean/context.md')
  .option('--json', 'Output JSON instead of Markdown')
  .option('--stdout', 'Print to stdout instead of file')
  .action(async (options) => {
    if (!isAuthenticated()) {
      output.error('Not authenticated. Please run "paean login" first.');
      process.exit(1);
    }

    const spin = output.spinner('Generating context...').start();

    try {
      // Gather context data
      const project = detectProject();
      const projectId = getProjectId(project);
      const todoResponse = await getTodoList();
      const pendingResponse = await getPendingChanges();

      spin.stop();

      const pendingTasks = todoResponse.data.items.filter(
        (t) => t.status === 'pending' || t.status === 'in_progress'
      );
      const recentCompleted = todoResponse.data.items
        .filter((t) => t.status === 'completed')
        .slice(0, 5);

      const contextData = {
        project: {
          name: project.name,
          type: project.type,
          path: project.path,
          id: projectId,
        },
        user: {
          email: getConfigValue('email'),
        },
        tasks: {
          pending: pendingTasks,
          recentlyCompleted: recentCompleted,
          stats: todoResponse.data.stats,
        },
        pendingChanges: pendingResponse.data,
        generatedAt: new Date().toISOString(),
      };

      // Generate output
      let content: string;
      if (options.json) {
        content = JSON.stringify(contextData, null, 2);
      } else {
        content = generateMarkdown(contextData, pendingTasks, recentCompleted);
      }

      // Output
      if (options.stdout) {
        console.log(content);
      } else {
        const outputPath = options.output;
        const dir = join(process.cwd(), outputPath.split('/').slice(0, -1).join('/'));

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        const fullPath = join(process.cwd(), outputPath);
        writeFileSync(fullPath, content, 'utf-8');

        output.success(`Context written to ${outputPath}`);
        output.dim(`Contains ${pendingTasks.length} pending tasks`);
      }
    } catch (error) {
      spin.stop();
      const message = error instanceof Error ? error.message : 'Unknown error';
      output.error(`Failed to generate context: ${message}`);
      process.exit(1);
    }
  });

interface ContextData {
  project: {
    name: string;
    type?: string;
    path: string;
    id: string;
  };
  user: {
    email?: string;
  };
  tasks: {
    pending: TodoItem[];
    recentlyCompleted: TodoItem[];
    stats: {
      total: number;
      completed: number;
      pending: number;
    };
  };
  generatedAt: string;
}

function generateMarkdown(
  data: ContextData,
  pendingTasks: TodoItem[],
  recentCompleted: TodoItem[]
): string {
  const lines: string[] = [];

  lines.push('# Paean AI Context');
  lines.push('');
  lines.push(`> Generated: ${new Date().toLocaleString()}`);
  lines.push(`> Project: ${data.project.name}`);
  if (data.user.email) {
    lines.push(`> User: ${data.user.email}`);
  }
  lines.push('');

  // Pending Tasks Section
  lines.push('## Pending Tasks');
  lines.push('');

  if (pendingTasks.length === 0) {
    lines.push('No pending tasks.');
  } else {
    lines.push('The following tasks need to be completed:');
    lines.push('');

    for (const task of pendingTasks) {
      const priority = task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟡' : '🟢';
      const status = task.status === 'in_progress' ? '⏳' : '○';

      lines.push(`### ${status} ${task.content}`);
      lines.push('');
      lines.push(`- **ID**: \`${task.id}\``);
      lines.push(`- **Priority**: ${priority} ${task.priority}`);
      lines.push(`- **Status**: ${task.status}`);

      if (task.tags && task.tags.length > 0) {
        lines.push(`- **Tags**: ${task.tags.join(', ')}`);
      }

      if (task.dueDate) {
        lines.push(`- **Due**: ${task.dueDate}`);
      }

      if (task.sourceContext) {
        lines.push(`- **Context**: ${task.sourceContext}`);
      }

      lines.push('');
    }
  }

  // Acceptance Criteria
  lines.push('## Acceptance Criteria');
  lines.push('');
  lines.push('When completing tasks, ensure:');
  lines.push('');
  lines.push('1. All code changes pass linting (`npm run lint` or equivalent)');
  lines.push('2. All tests pass (`npm test` or equivalent)');
  lines.push('3. Changes are documented if necessary');
  lines.push('4. Mark task as complete using `paean tasks complete <task_id>`');
  lines.push('');

  // Recently Completed Section
  if (recentCompleted.length > 0) {
    lines.push('## Recently Completed');
    lines.push('');
    lines.push('For context, these tasks were recently completed:');
    lines.push('');

    for (const task of recentCompleted) {
      lines.push(`- ✅ ${task.content} (\`${task.id.slice(0, 8)}\`)`);
    }

    lines.push('');
  }

  // Instructions for AI
  lines.push('## Instructions for AI Agents');
  lines.push('');
  lines.push('When working on these tasks:');
  lines.push('');
  lines.push('1. Focus on one task at a time, starting with the highest priority');
  lines.push('2. After completing a task, run: `paean tasks complete <task_id> --summary "Brief description"`');
  lines.push('3. If a task cannot be completed, update its status: `paean tasks update <task_id> --status in_progress`');
  lines.push('4. Create new tasks if you discover additional work: `paean tasks add "Task description"`');
  lines.push('');

  return lines.join('\n');
}
