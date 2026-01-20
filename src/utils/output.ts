/**
 * CLI output utilities
 * Provides consistent formatting for CLI output
 */

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

// Color scheme matching Paean brand
export const colors = {
  primary: chalk.hex('#06b6d4'), // Paean Blue
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  dim: chalk.gray,
  bold: chalk.bold,
};

/**
 * Print a success message
 */
export function success(message: string): void {
  console.log(colors.success('✓'), message);
}

/**
 * Print an error message
 */
export function error(message: string): void {
  console.error(colors.error('✗'), message);
}

/**
 * Print a warning message
 */
export function warning(message: string): void {
  console.log(colors.warning('⚠'), message);
}

/**
 * Print an info message
 */
export function info(message: string): void {
  console.log(colors.info('ℹ'), message);
}

/**
 * Print a primary colored message
 */
export function primary(message: string): void {
  console.log(colors.primary(message));
}

/**
 * Print a dim/muted message
 */
export function dim(message: string): void {
  console.log(colors.dim(message));
}

/**
 * Create a spinner
 */
export function spinner(text: string): Ora {
  return ora({
    text,
    color: 'cyan',
  });
}

/**
 * Print a header/title
 */
export function header(text: string): void {
  console.log();
  console.log(colors.bold(colors.primary(text)));
  console.log(colors.dim('─'.repeat(text.length + 4)));
}

/**
 * Print a table row
 */
export function tableRow(label: string, value: string, labelWidth = 20): void {
  const paddedLabel = label.padEnd(labelWidth);
  console.log(`  ${colors.dim(paddedLabel)} ${value}`);
}

/**
 * Print a list item
 */
export function listItem(text: string, indent = 0): void {
  const prefix = '  '.repeat(indent) + colors.dim('•');
  console.log(`${prefix} ${text}`);
}

/**
 * Print JSON output
 */
export function json(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

/**
 * Print a newline
 */
export function newline(): void {
  console.log();
}

/**
 * Format a task status with color
 */
export function formatStatus(status: string): string {
  switch (status) {
    case 'completed':
      return colors.success('✓ completed');
    case 'pending':
      return colors.warning('○ pending');
    case 'in_progress':
      return colors.info('◐ in progress');
    case 'cancelled':
      return colors.dim('✗ cancelled');
    default:
      return status;
  }
}

/**
 * Format a priority with color
 */
export function formatPriority(priority: string): string {
  switch (priority) {
    case 'high':
      return colors.error('▲ high');
    case 'medium':
      return colors.warning('■ medium');
    case 'low':
      return colors.dim('▽ low');
    default:
      return priority;
  }
}

/**
 * Format a date for display
 */
export function formatDate(date: string | Date): string {
  const d = new Date(date);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return 'today';
  } else if (days === 1) {
    return 'yesterday';
  } else if (days < 7) {
    return `${days} days ago`;
  } else {
    return d.toLocaleDateString();
  }
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
