/**
 * Session-Scoped Cron Scheduler (Open Source)
 * 
 * Provides in-memory scheduled task execution that lives only for the
 * current CLI session. All jobs are automatically cleaned up when the
 * process exits.
 * 
 * Supports:
 * - Fixed interval (every N seconds/minutes/hours)
 * - Hourly at specific minute (e.g. "every hour at :15")
 * - Cron expressions (minute hour day month weekday)
 * 
 * Security: only executes commands through the existing shell tool
 * infrastructure which enforces whitelist and dangerous-pattern checks.
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { randomBytes } from 'crypto';
import { executeSystemTool } from './system.js';

// ============================================
// Types
// ============================================

export interface CronJob {
  id: string;
  schedule: string;
  command: string;
  cwd?: string;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  lastResult: { success: boolean; summary: string } | null;
  status: 'active' | 'paused';
}

interface InternalCronJob extends CronJob {
  timerId: ReturnType<typeof setTimeout> | ReturnType<typeof setInterval> | null;
  intervalMs: number | null;
  cronFields: CronFields | null;
}

interface CronFields {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

// ============================================
// In-Memory Registry (session-scoped)
// ============================================

const cronJobs = new Map<string, InternalCronJob>();

let cleanupRegistered = false;

function ensureCleanupRegistered(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  const cleanup = () => {
    for (const job of cronJobs.values()) {
      if (job.timerId !== null) {
        clearTimeout(job.timerId as ReturnType<typeof setTimeout>);
        clearInterval(job.timerId as ReturnType<typeof setInterval>);
      }
    }
    cronJobs.clear();
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
}

function generateId(): string {
  return randomBytes(4).toString('hex');
}

// ============================================
// Schedule Parsing
// ============================================

function parseSchedule(schedule: string): { intervalMs: number | null; cronFields: CronFields | null } {
  const s = schedule.trim().toLowerCase();

  // "every Ns" / "every Nm" / "every Nh" — fixed interval
  const intervalMatch = s.match(/^every\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)$/);
  if (intervalMatch) {
    const value = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2].charAt(0);
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
    return { intervalMs: value * (multipliers[unit] || 60_000), cronFields: null };
  }

  // "every hour at :MM"
  const hourlyMatch = s.match(/^every\s+hour\s+at\s+:(\d{1,2})$/);
  if (hourlyMatch) {
    const minute = parseInt(hourlyMatch[1], 10);
    if (minute < 0 || minute > 59) throw new Error(`Invalid minute: ${minute}`);
    return {
      intervalMs: null,
      cronFields: {
        minute: [minute],
        hour: makeRange(0, 23),
        dayOfMonth: makeRange(1, 31),
        month: makeRange(1, 12),
        dayOfWeek: makeRange(0, 6),
      },
    };
  }

  // Cron expression: "M H DoM Mon DoW" (5 fields)
  const parts = schedule.trim().split(/\s+/);
  if (parts.length === 5) {
    try {
      return {
        intervalMs: null,
        cronFields: {
          minute: parseCronField(parts[0], 0, 59),
          hour: parseCronField(parts[1], 0, 23),
          dayOfMonth: parseCronField(parts[2], 1, 31),
          month: parseCronField(parts[3], 1, 12),
          dayOfWeek: parseCronField(parts[4], 0, 6),
        },
      };
    } catch (e) {
      throw new Error(`Invalid cron expression "${schedule}": ${(e as Error).message}`);
    }
  }

  throw new Error(
    `Unrecognized schedule "${schedule}". ` +
    `Supported: "every 5m", "every 1h", "every 30s", "every hour at :15", or cron expression "*/5 * * * *"`
  );
}

function parseCronField(field: string, min: number, max: number): number[] {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    const stepMatch = part.match(/^(.+)\/(\d+)$/);
    const step = stepMatch ? parseInt(stepMatch[2], 10) : 1;
    const range = stepMatch ? stepMatch[1] : part;

    if (range === '*') {
      for (let i = min; i <= max; i += step) values.add(i);
    } else if (range.includes('-')) {
      const [startStr, endStr] = range.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || start < min || end > max) {
        throw new Error(`Range ${range} out of bounds [${min}-${max}]`);
      }
      for (let i = start; i <= end; i += step) values.add(i);
    } else {
      const val = parseInt(range, 10);
      if (isNaN(val) || val < min || val > max) {
        throw new Error(`Value ${range} out of bounds [${min}-${max}]`);
      }
      values.add(val);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

function makeRange(min: number, max: number): number[] {
  const arr: number[] = [];
  for (let i = min; i <= max; i++) arr.push(i);
  return arr;
}

function getNextCronTime(fields: CronFields, after: Date): Date {
  const next = new Date(after.getTime() + 60_000);
  next.setSeconds(0, 0);

  for (let safety = 0; safety < 525960; safety++) {
    if (
      fields.month.includes(next.getMonth() + 1) &&
      fields.dayOfMonth.includes(next.getDate()) &&
      fields.dayOfWeek.includes(next.getDay()) &&
      fields.hour.includes(next.getHours()) &&
      fields.minute.includes(next.getMinutes())
    ) {
      return next;
    }
    next.setTime(next.getTime() + 60_000);
  }

  return new Date(after.getTime() + 3_600_000);
}

// ============================================
// Job Execution
// ============================================

async function executeJob(job: InternalCronJob): Promise<void> {
  job.lastRunAt = new Date().toISOString();
  job.runCount++;

  try {
    const result = await executeSystemTool('paean_execute_shell', {
      command: job.command,
      cwd: job.cwd,
      timeout: 300_000,
    });

    const r = result as { success?: boolean; stdout?: string; stderr?: string; error?: string };
    job.lastResult = {
      success: r.success === true,
      summary: r.success
        ? (r.stdout?.slice(0, 200) || 'OK')
        : (r.error?.slice(0, 200) || r.stderr?.slice(0, 200) || 'Failed'),
    };
  } catch (error) {
    job.lastResult = {
      success: false,
      summary: (error instanceof Error ? error.message : String(error)).slice(0, 200),
    };
  }

  if (job.cronFields && job.status === 'active') {
    scheduleNextCronRun(job);
  }
}

function scheduleNextCronRun(job: InternalCronJob): void {
  if (!job.cronFields) return;

  const nextTime = getNextCronTime(job.cronFields, new Date());
  job.nextRunAt = nextTime.toISOString();

  const delay = nextTime.getTime() - Date.now();
  if (job.timerId !== null) {
    clearTimeout(job.timerId as ReturnType<typeof setTimeout>);
  }
  job.timerId = setTimeout(() => {
    if (job.status === 'active') {
      executeJob(job);
    }
  }, Math.max(delay, 1000));
}

function startJob(job: InternalCronJob): void {
  if (job.intervalMs !== null) {
    job.nextRunAt = new Date(Date.now() + job.intervalMs).toISOString();
    job.timerId = setInterval(() => {
      if (job.status === 'active') {
        job.nextRunAt = new Date(Date.now() + job.intervalMs!).toISOString();
        executeJob(job);
      }
    }, job.intervalMs);
  } else if (job.cronFields) {
    scheduleNextCronRun(job);
  }
}

function stopJob(job: InternalCronJob): void {
  if (job.timerId !== null) {
    clearTimeout(job.timerId as ReturnType<typeof setTimeout>);
    clearInterval(job.timerId as ReturnType<typeof setInterval>);
    job.timerId = null;
  }
  job.nextRunAt = null;
}

function toPublicJob(job: InternalCronJob): CronJob {
  return {
    id: job.id,
    schedule: job.schedule,
    command: job.command,
    cwd: job.cwd,
    createdAt: job.createdAt,
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
    runCount: job.runCount,
    lastResult: job.lastResult,
    status: job.status,
  };
}

// ============================================
// MCP Tool Definitions
// ============================================

export function getCronToolDefinitions(): Tool[] {
  return [
    {
      name: 'paean_cron_create',
      description:
        'Create a session-scoped scheduled task (cron job). ' +
        'The job runs repeatedly on the given schedule until removed or the session ends. ' +
        'Schedules: "every 5m", "every 1h", "every 30s", "every hour at :15", ' +
        'or a 5-field cron expression like "*/10 * * * *". ' +
        'Commands are executed through the shell tool with security checks.',
      inputSchema: {
        type: 'object',
        properties: {
          schedule: {
            type: 'string',
            description:
              'Schedule expression. Examples: "every 5m", "every 1h", "every 30s", ' +
              '"every hour at :13", "*/10 * * * *" (every 10 min), "0 */2 * * *" (every 2 hours)',
          },
          command: {
            type: 'string',
            description: 'Shell command to execute on each trigger',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (optional)',
          },
        },
        required: ['schedule', 'command'],
      },
    },
    {
      name: 'paean_cron_list',
      description:
        'List all session-scoped cron jobs. Shows schedule, status, run count, ' +
        'last/next run time, and last result for each job.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'paean_cron_remove',
      description:
        'Remove a session-scoped cron job by ID. The job is stopped and deleted immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The ID of the cron job to remove',
          },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'paean_cron_get',
      description:
        'Get detailed status of a specific cron job by ID.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The ID of the cron job',
          },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'paean_cron_pause',
      description: 'Pause an active cron job. The job remains registered but stops executing.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The ID of the cron job to pause',
          },
        },
        required: ['jobId'],
      },
    },
    {
      name: 'paean_cron_resume',
      description: 'Resume a paused cron job.',
      inputSchema: {
        type: 'object',
        properties: {
          jobId: {
            type: 'string',
            description: 'The ID of the cron job to resume',
          },
        },
        required: ['jobId'],
      },
    },
  ];
}

export const CRON_TOOL_NAMES = new Set([
  'paean_cron_create',
  'paean_cron_list',
  'paean_cron_remove',
  'paean_cron_get',
  'paean_cron_pause',
  'paean_cron_resume',
]);

// ============================================
// MCP Tool Execution
// ============================================

export async function executeCronTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  ensureCleanupRegistered();

  switch (toolName) {
    case 'paean_cron_create': {
      const schedule = args.schedule as string;
      const command = args.command as string;
      const cwd = args.cwd as string | undefined;

      if (!schedule || !command) {
        return { success: false, error: 'schedule and command are required' };
      }

      if (cronJobs.size >= 20) {
        return {
          success: false,
          error: 'Maximum 20 concurrent cron jobs per session. Remove some before adding new ones.',
        };
      }

      let parsed: { intervalMs: number | null; cronFields: CronFields | null };
      try {
        parsed = parseSchedule(schedule);
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Invalid schedule',
        };
      }

      const id = generateId();
      const job: InternalCronJob = {
        id,
        schedule,
        command,
        cwd,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        nextRunAt: null,
        runCount: 0,
        lastResult: null,
        status: 'active',
        timerId: null,
        intervalMs: parsed.intervalMs,
        cronFields: parsed.cronFields,
      };

      cronJobs.set(id, job);
      startJob(job);

      return {
        success: true,
        message: `Cron job created: ${schedule}`,
        job: toPublicJob(job),
        note: 'This job is session-scoped and will be removed when the CLI session ends.',
      };
    }

    case 'paean_cron_list': {
      const jobs = Array.from(cronJobs.values()).map(toPublicJob);
      return {
        success: true,
        jobs,
        count: jobs.length,
        note: 'All jobs are session-scoped. They will be removed when the CLI session ends.',
      };
    }

    case 'paean_cron_remove': {
      const jobId = args.jobId as string;
      if (!jobId) {
        return { success: false, error: 'jobId is required' };
      }

      const job = cronJobs.get(jobId);
      if (!job) {
        return { success: false, error: `Cron job not found: ${jobId}` };
      }

      stopJob(job);
      cronJobs.delete(jobId);

      return {
        success: true,
        message: `Cron job ${jobId} removed`,
        removedJob: toPublicJob(job),
      };
    }

    case 'paean_cron_get': {
      const jobId = args.jobId as string;
      if (!jobId) {
        return { success: false, error: 'jobId is required' };
      }

      const job = cronJobs.get(jobId);
      if (!job) {
        return { success: false, error: `Cron job not found: ${jobId}` };
      }

      return {
        success: true,
        job: toPublicJob(job),
      };
    }

    case 'paean_cron_pause': {
      const jobId = args.jobId as string;
      if (!jobId) {
        return { success: false, error: 'jobId is required' };
      }

      const job = cronJobs.get(jobId);
      if (!job) {
        return { success: false, error: `Cron job not found: ${jobId}` };
      }

      if (job.status === 'paused') {
        return { success: false, error: `Cron job ${jobId} is already paused` };
      }

      stopJob(job);
      job.status = 'paused';

      return {
        success: true,
        message: `Cron job ${jobId} paused`,
        job: toPublicJob(job),
      };
    }

    case 'paean_cron_resume': {
      const jobId = args.jobId as string;
      if (!jobId) {
        return { success: false, error: 'jobId is required' };
      }

      const job = cronJobs.get(jobId);
      if (!job) {
        return { success: false, error: `Cron job not found: ${jobId}` };
      }

      if (job.status === 'active') {
        return { success: false, error: `Cron job ${jobId} is already active` };
      }

      job.status = 'active';
      startJob(job);

      return {
        success: true,
        message: `Cron job ${jobId} resumed`,
        job: toPublicJob(job),
      };
    }

    default:
      return { success: false, error: `Unknown cron tool: ${toolName}` };
  }
}

/**
 * Get all active cron jobs count (for status display)
 */
export function getActiveCronCount(): number {
  return Array.from(cronJobs.values()).filter(j => j.status === 'active').length;
}

/**
 * Remove all cron jobs (for testing or session cleanup)
 */
export function clearAllCronJobs(): void {
  for (const job of cronJobs.values()) {
    stopJob(job);
  }
  cronJobs.clear();
}
