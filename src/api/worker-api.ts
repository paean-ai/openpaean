/**
 * Worker API
 * Specialized API client for OpenPaean CLI Worker operations.
 *
 * All Worker API calls use a non-clearing API client so that
 * transient 401 errors don't invalidate the user's auth state.
 */

import { createNonClearingApiClient } from './client.js';
import type { TodoItem } from './todo.js';

function getWorkerApiClient() {
    return createNonClearingApiClient();
}

// ============================================
// Types
// ============================================

export interface CliPayload {
    hint?: string;
    workingDirectory?: string;
    timeout?: number;
    requiresConfirmation?: boolean;
    context?: Record<string, unknown>;
    allowedPaths?: string[];
}

export interface WorkerTask extends TodoItem {
    taskType: 'remote-agent';
    cliPayload?: CliPayload;
    claimedBySessionId?: string;
    claimedByDeviceName?: string;
    claimedAt?: string;
}

export type WorkerStatus = 'idle' | 'running' | 'paused';

export interface WorkerHeartbeatInput {
    status: WorkerStatus;
    currentTaskId?: string;
    completedCount?: number;
    failedCount?: number;
    workingDirectory?: string;
    capabilities?: string[];
}

export type ProgressStage = 'started' | 'executing' | 'verifying' | 'waiting_confirmation';

export interface TaskProgressInput {
    stage: ProgressStage;
    message?: string;
    percentage?: number;
}

export interface TaskExecutionResult {
    success: boolean;
    output?: string;
    artifacts?: Array<{
        type: 'file' | 'text';
        name: string;
        content: string;
    }>;
    durationMs?: number;
}

export interface ActiveWorker {
    sessionId: string;
    deviceName: string;
    deviceType: string;
    status: WorkerStatus;
    capabilities: string[];
    currentTaskId?: string;
    lastHeartbeat?: string;
}

// ============================================
// API Functions
// ============================================

export async function pollWorkerTasks(options?: {
    sessionId: string;
    taskTypes?: Array<'remote-agent'>;
    tags?: string[];
    limit?: number;
}): Promise<{ tasks: WorkerTask[]; count: number }> {
    const client = getWorkerApiClient();
    const response = await client.post<{
        success: boolean;
        data: { tasks: WorkerTask[]; count: number };
    }>('/sdk/worker/poll', options);
    return response.data.data;
}

export async function claimTask(
    taskId: string,
    sessionId: string,
    deviceName?: string
): Promise<{ success: boolean; task?: WorkerTask; error?: string }> {
    const client = getWorkerApiClient();
    const response = await client.post<{
        success: boolean;
        task?: WorkerTask;
        error?: string;
    }>(`/sdk/worker/claim/${taskId}`, { sessionId, deviceName });
    return response.data;
}

export async function releaseTask(
    taskId: string,
    sessionId: string,
    reason?: string
): Promise<{ success: boolean; error?: string }> {
    const client = getWorkerApiClient();
    try {
        const response = await client.post<{ success: boolean; error?: string }>(
            `/sdk/worker/release/${taskId}`,
            { sessionId, reason }
        );
        return response.data;
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function sendHeartbeat(
    sessionId: string,
    input: WorkerHeartbeatInput
): Promise<{ success: boolean; error?: string }> {
    const client = getWorkerApiClient();
    try {
        const response = await client.post<{ success: boolean; error?: string }>(
            '/sdk/worker/heartbeat',
            { sessionId, ...input }
        );
        return response.data;
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function reportProgress(
    taskId: string,
    sessionId: string,
    progress: TaskProgressInput
): Promise<{ success: boolean; subtaskId?: string; error?: string }> {
    const client = getWorkerApiClient();
    try {
        const response = await client.post<{
            success: boolean;
            subtaskId?: string;
            error?: string;
        }>(`/sdk/worker/progress/${taskId}`, { sessionId, ...progress });
        return response.data;
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function completeWorkerTask(
    taskId: string,
    sessionId: string,
    result: TaskExecutionResult
): Promise<{ success: boolean; error?: string }> {
    const client = getWorkerApiClient();
    try {
        const response = await client.post<{ success: boolean; error?: string }>(
            `/sdk/worker/complete/${taskId}`,
            { sessionId, result }
        );
        return response.data;
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function checkConfirmation(
    taskId: string,
    subtaskId: string
): Promise<{ approved: boolean; error?: string }> {
    const client = getWorkerApiClient();
    try {
        const response = await client.get<{
            success: boolean;
            approved: boolean;
            error?: string;
        }>(`/sdk/worker/confirmation/${taskId}/${subtaskId}`);
        return { approved: response.data.approved };
    } catch (error) {
        return { approved: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function getActiveWorkers(): Promise<ActiveWorker[]> {
    const client = getWorkerApiClient();
    try {
        const response = await client.get<{
            success: boolean;
            data: ActiveWorker[];
        }>('/sdk/worker/active');
        return response.data.data;
    } catch {
        return [];
    }
}
