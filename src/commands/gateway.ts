/**
 * Gateway Command
 * CLI commands for the cross-device session gateway.
 * Allows the local OpenPaean CLI to serve as a relay for remote web/mobile clients.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getConfigDir } from '../utils/config.js';

function getGatewayPidFile(): string {
    return join(getConfigDir(), 'gateway.pid');
}

function removeGatewayPid(): void {
    try { unlinkSync(getGatewayPidFile()); } catch { /* ignore */ }
}

function readGatewayPid(): { pid: number; startedAt: string; workspace?: string } | null {
    try {
        const pidFile = getGatewayPidFile();
        if (!existsSync(pidFile)) return null;
        return JSON.parse(readFileSync(pidFile, 'utf-8'));
    } catch { return null; }
}

function isProcessRunning(pid: number): boolean {
    try { process.kill(pid, 0); return true; } catch { return false; }
}

export const gatewayCommand = new Command('gateway')
    .description('Cross-device session gateway — relay remote requests through local CLI');

gatewayCommand
    .command('status')
    .description('Check gateway status')
    .action(() => {
        const pidInfo = readGatewayPid();
        if (!pidInfo) {
            console.log(chalk.gray('No gateway running.'));
            return;
        }

        if (!isProcessRunning(pidInfo.pid)) {
            console.log(chalk.yellow('Gateway process not found (stale PID file).'));
            removeGatewayPid();
            return;
        }

        console.log(chalk.green.bold('Gateway is running'));
        console.log(chalk.gray(`  PID: ${pidInfo.pid}`));
        console.log(chalk.gray(`  Started: ${pidInfo.startedAt}`));
        if (pidInfo.workspace) {
            console.log(chalk.gray(`  Workspace: ${pidInfo.workspace}`));
        }
    });

gatewayCommand
    .command('stop')
    .description('Stop the running gateway')
    .action(() => {
        const pidInfo = readGatewayPid();
        if (!pidInfo) {
            console.log(chalk.gray('No gateway running.'));
            return;
        }

        if (!isProcessRunning(pidInfo.pid)) {
            console.log(chalk.yellow('Gateway process not found (stale PID file).'));
            removeGatewayPid();
            return;
        }

        try {
            process.kill(pidInfo.pid, 'SIGTERM');
            console.log(chalk.green(`Sent stop signal to gateway (PID: ${pidInfo.pid})`));
            removeGatewayPid();
        } catch (error) {
            console.error(chalk.red(`Failed to stop gateway: ${error instanceof Error ? error.message : error}`));
        }
    });
