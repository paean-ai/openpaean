/**
 * Session-Scoped Cron Scheduler (Open Source)
 * 
 * Pushes natural-language prompts into the main agent interaction on a
 * schedule, as if the user had typed them.  This gives cron jobs full
 * agent capabilities (tool use, reasoning, multi-step tasks) instead of
 * being limited to simple shell commands.
 * 
 * Key behaviour:
 * - When a job fires and the agent is **idle**, the prompt is injected
 *   into the conversation automatically.
 * - When the agent is **busy**, the execution is skipped (recorded as
 *   "skipped: agent busy") to avoid conflicts.
 * - All jobs are session-scoped and cleaned up on process exit.
 * 
 * Supports:
 * - Fixed interval (every N seconds/minutes/hours)
 * - Hourly at specific minute (e.g. "every hour at :15")
 * - Cron expressions (minute hour day month weekday)
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

export interface CronJob {
  id: string;
  schedule: string;
  /** Natural-language prompt injected into the agent conversation */
  prompt: string;
  cwd?: string;
  createdAt: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  skipCount: number;
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
// Prompt Injection Event Bus
// ============================================

export interface CronPromptEvent {
  jobId: string;
  prompt: string;
  cwd?: string;
  schedule: string;
}

const cronEmitter = new EventEmitter();

/**
 * Register a callback that fires whenever a cron job wants to inject a
 * prompt into the main agent conversation.
 * Returns an unsubscribe function.
 */
export function onCronPrompt(
  callback: (event: CronPromptEvent) => void,
): () => void {
  cronEmitter.on('cron-prompt', callback);
  return () => {
    cronEmitter.off('cron-prompt', callback);
  };
}

/**
 * Callback that returns `true` when the agent is currently processing a
 * message and should not be interrupted by cron prompts.
 */
let agentBusyChecker: (() => boolean) | null = null;

/**
 * Register a function that the scheduler calls before injecting a prompt.
 * If it returns `true`, the prompt is skipped for that tick.
 */
export function setAgentBusyChecker(checker: () => boolean): void {
  agentBusyChecker = checker;
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

  const intervalMatch = s.match(/^every\s+(\d+)\s*(s|sec|seconds?|m|min|minutes?|h|hr|hours?)$/);
  if (intervalMatch) {
    const value = parseInt(intervalMatch[1], 10);
    const unit = intervalMatch[2].charAt(0);
    const multipliers: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000 };
    return { intervalMs: value * (multipliers[unit] || 60_000), cronFields: null };
  }

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
// Job Execution — Prompt Injection
// ============================================

async function executeJob(job: InternalCronJob): Promise<void> {
  if (agentBusyChecker && agentBusyChecker()) {
    job.skipCount++;
    job.lastResult = {
      success: false,
      summary: 'Skipped: agent is busy processing another request',
    };
    if (job.cronFields && job.status === 'active') {
      scheduleNextCronRun(job);
    }
    return;
  }

  job.lastRunAt = new Date().toISOString();
  job.runCount++;

  cronEmitter.emit('cron-prompt', {
    jobId: job.id,
    prompt: job.prompt,
    cwd: job.cwd,
    schedule: job.schedule,
  } satisfies CronPromptEvent);

  job.lastResult = {
    success: true,
    summary: `Prompt injected: "${job.prompt.slice(0, 100)}${job.prompt.length > 100 ? '...' : ''}"`,
  };

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
    prompt: job.prompt,
    cwd: job.cwd,
    createdAt: job.createdAt,
    lastRunAt: job.lastRunAt,
    nextRunAt: job.nextRunAt,
    runCount: job.runCount,
    skipCount: job.skipCount,
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
        'Create a session-scoped scheduled task. ' +
        'The prompt is injected into the main agent conversation on each trigger, ' +
        'giving the task full agent capabilities (tool use, reasoning, multi-step work). ' +
        'If the agent is busy when a job fires, execution is skipped. ' +
        'Schedules: "every 5m", "every 1h", "every 30s", "every hour at :15", ' +
        'or a 5-field cron expression like "*/10 * * * *".',
      inputSchema: {
        type: 'object',
        properties: {
          schedule: {
            type: 'string',
            description:
              'Schedule expression. Examples: "every 5m", "every 1h", "every 30s", ' +
              '"every hour at :13", "*/10 * * * *" (every 10 min), "0 */2 * * *" (every 2 hours)',
          },
          prompt: {
            type: 'string',
            description:
              'Natural-language prompt to inject into the agent conversation on each trigger. ' +
              'This is equivalent to the user typing this message. The agent will process it ' +
              'with full tool access and reasoning capabilities. ' +
              'Example: "Check disk usage and alert me if any partition is above 90%"',
          },
          cwd: {
            type: 'string',
            description: 'Working directory context for the prompt (optional)',
          },
        },
        required: ['schedule', 'prompt'],
      },
    },
    {
      name: 'paean_cron_list',
      description:
        'List all session-scoped cron jobs. Shows schedule, prompt, status, run count, ' +
        'skip count, last/next run time, and last result for each job.',
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
      description: 'Pause an active cron job. The job remains registered but stops firing prompts.',
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
      const prompt = args.prompt as string;
      const cwd = args.cwd as string | undefined;

      if (!schedule || !prompt) {
        return { success: false, error: 'schedule and prompt are required' };
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
        prompt,
        cwd,
        createdAt: new Date().toISOString(),
        lastRunAt: null,
        nextRunAt: null,
        runCount: 0,
        skipCount: 0,
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
        note: 'This job will inject the prompt into the main agent conversation on each trigger. ' +
              'If the agent is busy, the execution will be skipped. ' +
              'The job is session-scoped and will be removed when the CLI session ends. ' +
              'Use `paean_cron_get` or `paean_cron_list` tools to check job status — there is no HTTP API.',
      };
    }

    case 'paean_cron_list': {
      const jobs = Array.from(cronJobs.values()).map(toPublicJob);
      return {
        success: true,
        jobs,
        count: jobs.length,
        note: 'All jobs are session-scoped. Prompts are injected into the main conversation when triggered.',
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
