/**
 * CLI Agent MCP Tools (Open Source)
 *
 * Enables invoking external coding CLI agents (Articulate/a8e, Claude Code,
 * Cursor Agent, etc.) as MCP tools. This provides a unified interface for
 * delegating tasks to any installed coding assistant.
 *
 * @module mcp/cli-agents
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { spawn, type ChildProcess } from 'child_process';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';

const exec = promisify(execCallback);

/** Supported CLI agent types */
export type CliAgentType = 'articulate' | 'claude' | 'cursor' | 'gemini' | 'codex' | 'opencode' | 'paeanclaw';

interface CliAgentInfo {
    type: CliAgentType;
    name: string;
    binary: string;
    url: string;
    buildArgs: (prompt: string, options?: InvokeOptions) => string[];
}

interface InvokeOptions {
    cwd?: string;
    timeout?: number;
    outputFormat?: 'text' | 'json';
    extraArgs?: string[];
}

const CLI_AGENTS: CliAgentInfo[] = [
    {
        type: 'articulate',
        name: 'Articulate (a8e)',
        binary: 'a8e',
        url: 'https://github.com/a8e-ai/a8e',
        buildArgs: (prompt, options) => {
            const args = ['run', '--text', prompt];
            if (options?.outputFormat === 'json') args.push('--output-format', 'json');
            if (options?.extraArgs) args.push(...options.extraArgs);
            return args;
        },
    },
    {
        type: 'claude',
        name: 'Claude Code',
        binary: 'claude',
        url: 'https://docs.anthropic.com/en/docs/claude-code',
        buildArgs: (prompt, options) => {
            const args = ['-p', prompt, '--permission-mode', 'acceptEdits'];
            if (options?.extraArgs) args.push(...options.extraArgs);
            return args;
        },
    },
    {
        type: 'cursor',
        name: 'Cursor Agent',
        binary: 'cursor-agent',
        url: 'https://docs.cursor.com/agent',
        buildArgs: (prompt, options) => {
            const args = ['--print', '--force', '--approve-mcps'];
            if (options?.cwd) args.push('--workspace', options.cwd);
            if (options?.extraArgs) args.push(...options.extraArgs);
            args.push(prompt);
            return args;
        },
    },
    {
        type: 'gemini',
        name: 'Gemini CLI',
        binary: 'gemini',
        url: 'https://github.com/google-gemini/gemini-cli',
        buildArgs: (prompt, options) => {
            const args = ['-p', prompt];
            if (options?.extraArgs) args.push(...options.extraArgs);
            return args;
        },
    },
    {
        type: 'codex',
        name: 'OpenAI Codex',
        binary: 'codex',
        url: 'https://github.com/openai/codex',
        buildArgs: (prompt, options) => {
            const args = ['--quiet', '--full-auto', prompt];
            if (options?.extraArgs) args.push(...options.extraArgs);
            return args;
        },
    },
    {
        type: 'opencode',
        name: 'OpenCode',
        binary: 'opencode',
        url: 'https://github.com/opencode-ai/opencode',
        buildArgs: (prompt, options) => {
            const args = ['run', prompt];
            if (options?.extraArgs) args.push(...options.extraArgs);
            return args;
        },
    },
    {
        type: 'paeanclaw',
        name: 'PaeanClaw Local Agent',
        binary: 'paeanclaw',
        url: 'https://github.com/paean-ai/paeanclaw',
        buildArgs: () => [],
    },
];

const agentTypes = CLI_AGENTS.map(a => a.type);

async function checkBinary(binary: string): Promise<{ exists: boolean; path?: string }> {
    try {
        const { stdout } = await exec(`which ${binary}`);
        return { exists: true, path: stdout.trim() };
    } catch {
        return { exists: false };
    }
}

const PAEANCLAW_BASE_URL = process.env.PAEANCLAW_URL || 'http://localhost:3007';

async function checkPaeanclawRunning(): Promise<{ exists: boolean; path?: string }> {
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${PAEANCLAW_BASE_URL}/api/conversations`, { signal: controller.signal });
        clearTimeout(timer);
        return { exists: res.ok, path: PAEANCLAW_BASE_URL };
    } catch {
        return { exists: false };
    }
}

async function invokePaeanclaw(prompt: string, timeoutSec: number): Promise<unknown> {
    const timeoutMs = timeoutSec * 1000;
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(`${PAEANCLAW_BASE_URL}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: prompt }),
            signal: controller.signal,
        });

        if (!res.ok || !res.body) {
            clearTimeout(timeoutId);
            return {
                success: false,
                agent: 'paeanclaw',
                error: `PaeanClaw HTTP ${res.status}: ${res.statusText}`,
                durationMs: Date.now() - startTime,
            };
        }

        let fullContent = '';
        let lastError: string | undefined;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('data:')) continue;
                const payload = trimmed.slice(5).trim();
                if (!payload || payload === '[DONE]') continue;
                try {
                    const event = JSON.parse(payload) as Record<string, unknown>;
                    if (event.type === 'content') fullContent += event.text as string;
                    if (event.type === 'done' && event.content) fullContent = event.content as string;
                    if (event.type === 'error') lastError = event.error as string;
                } catch { /* skip */ }
            }
        }

        clearTimeout(timeoutId);

        return {
            success: !lastError,
            agent: 'paeanclaw',
            output: fullContent,
            error: lastError,
            durationMs: Date.now() - startTime,
        };
    } catch (error) {
        clearTimeout(timeoutId);
        const msg = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            agent: 'paeanclaw',
            error: msg.includes('abort') ? `Execution timed out after ${timeoutSec}s` : msg,
            durationMs: Date.now() - startTime,
        };
    }
}

/**
 * Get CLI agent tool definitions
 */
export function getCliAgentTools(): Tool[] {
    return [
        {
            name: 'openpaean_list_cli_agents',
            description:
                'List all supported CLI coding agents and their installation status. ' +
                'Discovers which external AI coding tools are available on this system.',
            inputSchema: {
                type: 'object',
                properties: {},
            },
        },
        {
            name: 'openpaean_invoke_cli_agent',
            description:
                'Invoke an external CLI coding agent to perform a task. ' +
                'Supports Articulate (a8e), Claude Code, Cursor Agent, Gemini CLI, Codex, OpenCode, and PaeanClaw (local agent via HTTP). ' +
                'Use openpaean_list_cli_agents first to check which agents are available.',
            inputSchema: {
                type: 'object',
                properties: {
                    agent: {
                        type: 'string',
                        enum: agentTypes,
                        description: 'The CLI agent to invoke',
                    },
                    prompt: {
                        type: 'string',
                        description: 'The task prompt to send to the CLI agent',
                    },
                    workingDirectory: {
                        type: 'string',
                        description: 'Working directory for execution (default: current directory)',
                    },
                    timeout: {
                        type: 'number',
                        description: 'Execution timeout in seconds (default: 600)',
                    },
                    outputFormat: {
                        type: 'string',
                        enum: ['text', 'json'],
                        description: 'Output format (default: text)',
                    },
                },
                required: ['agent', 'prompt'],
            },
        },
    ];
}

/**
 * Execute a CLI agent tool
 */
export async function executeCliAgentTool(
    toolName: string,
    args: Record<string, unknown>,
): Promise<unknown> {
    switch (toolName) {
        case 'openpaean_list_cli_agents':
            return listCliAgents();
        case 'openpaean_invoke_cli_agent':
            return invokeCliAgent(args);
        default:
            return { success: false, error: `Unknown CLI agent tool: ${toolName}` };
    }
}

async function listCliAgents(): Promise<unknown> {
    const results = await Promise.all(
        CLI_AGENTS.map(async (agent) => {
            const check = agent.type === 'paeanclaw'
                ? await checkPaeanclawRunning()
                : await checkBinary(agent.binary);
            return {
                type: agent.type,
                name: agent.name,
                binary: agent.type === 'paeanclaw' ? `${PAEANCLAW_BASE_URL} (HTTP)` : agent.binary,
                installed: check.exists,
                binaryPath: check.path,
                url: agent.url,
            };
        })
    );

    const installedCount = results.filter(r => r.installed).length;
    return {
        success: true,
        summary: `${installedCount} of ${results.length} CLI agents available`,
        agents: results,
    };
}

async function invokeCliAgent(args: Record<string, unknown>): Promise<unknown> {
    const agentType = args.agent as CliAgentType;
    const prompt = args.prompt as string;
    const cwd = args.workingDirectory as string | undefined;
    const timeoutSec = (args.timeout as number) || 600;
    const outputFormat = (args.outputFormat as 'text' | 'json') || 'text';

    if (!prompt || typeof prompt !== 'string') {
        return { success: false, error: 'prompt is required' };
    }

    const agent = CLI_AGENTS.find(a => a.type === agentType);
    if (!agent) {
        return { success: false, error: `Unknown agent: ${agentType}`, validTypes: agentTypes };
    }

    // PaeanClaw: HTTP-based invocation instead of spawning a process
    if (agentType === 'paeanclaw') {
        const { exists } = await checkPaeanclawRunning();
        if (!exists) {
            return {
                success: false,
                error: `PaeanClaw is not running at ${PAEANCLAW_BASE_URL}. Start it with: npx paeanclaw`,
                installUrl: agent.url,
            };
        }
        return invokePaeanclaw(prompt, timeoutSec);
    }

    const { exists } = await checkBinary(agent.binary);
    if (!exists) {
        return {
            success: false,
            error: `${agent.name} (${agent.binary}) is not installed`,
            installUrl: agent.url,
        };
    }

    const cliArgs = agent.buildArgs(prompt, { cwd, outputFormat });
    const timeoutMs = timeoutSec * 1000;
    const startTime = Date.now();

    return new Promise<unknown>((resolve) => {
        let stdout = '';
        let stderr = '';

        const proc: ChildProcess = spawn(agent.binary, cliArgs, {
            cwd: cwd || process.cwd(),
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        const timeoutId = setTimeout(() => {
            proc.kill('SIGTERM');
            resolve({
                success: false,
                agent: agentType,
                error: `Execution timed out after ${timeoutSec}s`,
                output: stdout,
                durationMs: Date.now() - startTime,
            });
        }, timeoutMs);

        proc.stdout?.on('data', (data) => { stdout += data.toString(); });
        proc.stderr?.on('data', (data) => { stderr += data.toString(); });

        proc.on('close', (code) => {
            clearTimeout(timeoutId);

            let structured: Record<string, unknown> | undefined;
            try {
                if (stdout.trim().startsWith('{')) {
                    structured = JSON.parse(stdout);
                }
            } catch {
                // Not JSON
            }

            resolve({
                success: code === 0,
                agent: agentType,
                output: stdout,
                error: code !== 0 ? stderr || `Exit code: ${code}` : undefined,
                exitCode: code ?? undefined,
                durationMs: Date.now() - startTime,
                structured,
            });
        });

        proc.on('error', (err) => {
            clearTimeout(timeoutId);
            resolve({
                success: false,
                agent: agentType,
                error: err.message,
                durationMs: Date.now() - startTime,
            });
        });
    });
}

/** CLI agent tool names for routing */
export const CLI_AGENT_TOOL_NAMES = new Set([
    'openpaean_list_cli_agents',
    'openpaean_invoke_cli_agent',
]);
