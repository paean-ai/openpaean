/**
 * Worker Command
 * CLI commands for the OpenPaean Local Autonomous Worker
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import {
    WorkerService,
    DEFAULT_WORKER_CONFIG,
    type WorkerEvent,
    type ExecutorType,
    getExecutorRegistry,
    ArticulateExecutor,
    ClaudeExecutor,
} from '../worker/index.js';
import { isAuthenticated, getConfigDir } from '../utils/config.js';
import * as output from '../utils/output.js';

function getWorkerPidFile(): string {
    return join(getConfigDir(), 'worker.pid');
}

interface WorkerPidInfo {
    pid: number;
    startedAt: string;
    workspace?: string;
}

function writeWorkerPid(workspace?: string): void {
    const info: WorkerPidInfo = {
        pid: process.pid,
        startedAt: new Date().toISOString(),
        workspace,
    };
    try {
        writeFileSync(getWorkerPidFile(), JSON.stringify(info, null, 2));
    } catch { /* best effort */ }
}

function readWorkerPid(): WorkerPidInfo | null {
    try {
        if (!existsSync(getWorkerPidFile())) return null;
        return JSON.parse(readFileSync(getWorkerPidFile(), 'utf-8'));
    } catch {
        return null;
    }
}

function removeWorkerPid(): void {
    try { unlinkSync(getWorkerPidFile()); } catch { /* ignore */ }
}

function isWorkerRunning(pid: number): boolean {
    try { process.kill(pid, 0); return true; } catch { return false; }
}

function requireAuth(): void {
    if (!isAuthenticated()) {
        output.error('Not authenticated. Please run "openpaean login" first.');
        process.exit(1);
    }
}

export const workerCommand = new Command('worker')
    .description('Autonomous worker mode for continuous task execution');

workerCommand
    .command('start')
    .description('Start the autonomous worker loop')
    .option('-i, --interval <ms>', 'Poll interval in milliseconds', String(DEFAULT_WORKER_CONFIG.pollInterval))
    .option('-r, --max-retries <n>', 'Maximum retries per task', String(DEFAULT_WORKER_CONFIG.maxRetries))
    .option('-t, --timeout <ms>', 'Task timeout in milliseconds', String(DEFAULT_WORKER_CONFIG.taskTimeout))
    .option('--no-verification', 'Disable verification step')
    .option('-d, --debug', 'Enable debug logging')
    .action(async (options) => {
        console.log(chalk.yellow('\n  [Deprecated] `openpaean worker start` will be removed in a future release.'));
        console.log(chalk.yellow('  Use `openpaean --worker` to enable the worker within the interactive CLI.\n'));

        requireAuth();

        const parsedInterval = parseInt(options.interval, 10);
        const parsedRetries = parseInt(options.maxRetries, 10);
        const parsedTimeout = parseInt(options.timeout, 10);

        const config = {
            pollInterval: Math.max(1000, isNaN(parsedInterval) ? DEFAULT_WORKER_CONFIG.pollInterval : parsedInterval),
            maxRetries: Math.max(1, Math.min(10, isNaN(parsedRetries) ? DEFAULT_WORKER_CONFIG.maxRetries : parsedRetries)),
            taskTimeout: Math.max(10000, isNaN(parsedTimeout) ? DEFAULT_WORKER_CONFIG.taskTimeout : parsedTimeout),
            verificationEnabled: options.verification !== false,
            debug: options.debug ?? false,
            autonomousMode: true,
        };

        console.log('');
        console.log(chalk.bold.cyan('  ╔══════════════════════════════════════════════════╗'));
        console.log(chalk.bold.cyan('  ║') + chalk.bold.white('       OPENPAEAN WORKER ') + chalk.green('●') + chalk.white(' Starting...') + chalk.bold.cyan('        ║'));
        console.log(chalk.bold.cyan('  ╚══════════════════════════════════════════════════╝'));
        console.log('');

        output.tableRow('Poll Interval', `${config.pollInterval / 1000}s`, 20);
        output.tableRow('Max Retries', String(config.maxRetries), 20);
        output.tableRow('Task Timeout', `${config.taskTimeout / 60000}min`, 20);
        output.tableRow('Verification', config.verificationEnabled ? 'Enabled' : 'Disabled', 20);
        console.log('');

        const worker = new WorkerService(config);
        writeWorkerPid();

        const startTime = Date.now();

        worker.onEvent((event: WorkerEvent) => {
            const elapsed = output.formatDuration(Date.now() - startTime);

            switch (event.type) {
                case 'started':
                    console.log(chalk.green('✓') + chalk.dim(' Worker started'));
                    console.log(chalk.dim(`  Press Ctrl+C to stop\n`));
                    break;

                case 'stopped':
                    console.log(chalk.yellow('●') + chalk.dim(' Worker stopped'));
                    break;

                case 'task_claimed':
                    console.log(chalk.cyan('▶') + ` Task claimed: ${chalk.white(output.truncate(event.task.content, 50))}`);
                    console.log(chalk.dim(`  ID: ${event.task.id} | Priority: ${event.task.priority}`));
                    break;

                case 'task_started':
                    console.log(chalk.blue('◉') + ` Executing (attempt ${event.attempt}/${config.maxRetries})...`);
                    break;

                case 'task_completed':
                    console.log(chalk.green('✓') + ` Task completed in ${output.formatDuration(event.duration)}`);
                    console.log('');
                    break;

                case 'task_failed':
                    console.log(chalk.red('✗') + ` Task failed: ${chalk.dim(output.truncate(event.error, 60))}`);
                    if (event.willRetry) {
                        console.log(chalk.yellow('↻') + chalk.dim(' Will retry...'));
                    }
                    break;

                case 'task_verification_failed':
                    console.log(chalk.yellow('⚠') + ' Verification failed, will retry...');
                    break;

                case 'poll_empty':
                    if (config.debug) {
                        console.log(chalk.dim(`  [${elapsed}] No pending tasks`));
                    }
                    break;

                case 'error':
                    console.log(chalk.red('✗') + ` Error: ${event.error}`);
                    break;
            }
        });

        let cleaningUp = false;
        let lastSigintTime = 0;

        const cleanup = async () => {
            if (cleaningUp) return;
            cleaningUp = true;

            process.off('SIGINT', handleSigint);
            process.off('SIGTERM', cleanup);

            console.log('');
            console.log(chalk.yellow('Stopping worker...'));

            try {
                await worker.stop();
            } catch (err) {
                if (config.debug) {
                    console.log(chalk.dim(`  Warning: cleanup error: ${(err as Error).message}`));
                }
            }

            removeWorkerPid();

            const state = worker.getState();
            console.log('');
            console.log(chalk.bold('Session Summary:'));
            output.tableRow('Completed', String(state.completedCount), 15);
            output.tableRow('Failed', String(state.failedCount), 15);
            output.tableRow('Uptime', output.formatDuration(Date.now() - startTime), 15);
            console.log('');

            process.exit(0);
        };

        const handleSigint = () => {
            const now = Date.now();
            if (now - lastSigintTime < 1000) {
                cleanup();
            } else {
                lastSigintTime = now;
                console.log('');
                console.log(chalk.dim('  Press Ctrl+C again to stop the worker'));
            }
        };

        process.on('SIGINT', handleSigint);
        process.on('SIGTERM', cleanup);

        try {
            await worker.start();
            await new Promise(() => {});
        } catch (error) {
            console.log(chalk.red('✗') + ` Failed to start worker: ${(error as Error).message}`);
            process.exit(1);
        }
    });

workerCommand
    .command('status')
    .description('Check worker status')
    .option('--json', 'Output as JSON')
    .action((options) => {
        const pidInfo = readWorkerPid();

        if (!pidInfo) {
            console.log(chalk.dim('No worker is currently running.'));
            console.log(chalk.dim('Use `openpaean worker start` to start a worker.'));
            return;
        }

        const running = isWorkerRunning(pidInfo.pid);

        if (!running) {
            removeWorkerPid();
            console.log(chalk.dim('No worker is currently running (stale PID file cleaned up).'));
            return;
        }

        if (options.json) {
            console.log(JSON.stringify({ ...pidInfo, running }, null, 2));
            return;
        }

        const uptime = output.formatDuration(Date.now() - new Date(pidInfo.startedAt).getTime());

        console.log(chalk.bold.blue('\nWorker Status\n'));
        output.tableRow('Status', chalk.green('Running'), 15);
        output.tableRow('PID', String(pidInfo.pid), 15);
        output.tableRow('Uptime', uptime, 15);
        output.tableRow('Started', new Date(pidInfo.startedAt).toLocaleString(), 15);
        if (pidInfo.workspace) {
            output.tableRow('Workspace', pidInfo.workspace, 15);
        }
        console.log('');
    });

workerCommand
    .command('prompt')
    .description('Execute a task with a specific executor')
    .argument('[prompt...]', 'Natural language task prompt')
    .option('-p, --prompt <text>', 'Prompt text (alternative to positional)')
    .option('-e, --executor <type>', 'Force specific executor (claude|articulate)')
    .option('--auto-approve', 'Skip confirmation prompts')
    .option('-w, --workspace <path>', 'Working directory')
    .option('-v, --verbose', 'Enable verbose logging')
    .action(async (promptArgs: string[], options) => {
        requireAuth();

        const promptText = options.prompt || promptArgs.join(' ');
        if (!promptText.trim()) {
            output.error('No prompt provided. Usage: openpaean worker prompt "Your task"');
            process.exit(1);
        }

        const debug = options.verbose ?? false;
        const cwd = options.workspace || process.cwd();

        const registry = getExecutorRegistry();
        registry.register(new ArticulateExecutor());
        registry.register(new ClaudeExecutor());

        const executorType: ExecutorType = (options.executor as ExecutorType) || 'articulate';

        const available = await registry.getAvailable();
        if (debug) {
            console.log(chalk.dim(`Available executors: ${available.join(', ')}`));
        }

        const finalExecutor = available.includes(executorType) ? executorType : (available[0] || 'articulate');

        if (!available.includes(executorType)) {
            console.log(chalk.yellow('⚠') + ` Executor '${executorType}' not available, using '${finalExecutor}'`);
        }

        console.log(chalk.blue('◉') + ` Executing with ${chalk.bold(finalExecutor)} executor...`);
        console.log(chalk.dim('─'.repeat(50)));

        const startTime = Date.now();
        const result = await registry.execute(finalExecutor, promptText, {
            cwd,
            skipPermissions: options.autoApprove,
            timeout: 600000,
            onOutput: (text, stream) => {
                const lines = text.split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        const prefix = stream === 'stderr' ? chalk.yellow('│') : chalk.dim('│');
                        console.log(prefix + ' ' + output.truncate(line, 70));
                    }
                }
            },
        });

        console.log(chalk.dim('─'.repeat(50)));

        const totalDuration = Date.now() - startTime;

        if (result.success) {
            console.log(chalk.green('✓') + ` Execution completed`);
        } else {
            console.log(chalk.red('✗') + ` Execution failed`);
            if (result.error) {
                console.log(chalk.dim(`  Error: ${output.truncate(result.error, 60)}`));
            }
        }

        console.log('');
        console.log(chalk.bold('Summary:'));
        output.tableRow('Status', result.success ? 'Success' : 'Failed', 15);
        output.tableRow('Executor', finalExecutor, 15);
        output.tableRow('Duration', output.formatDuration(totalDuration), 15);
        console.log('');

        process.exit(result.success ? 0 : 1);
    });
