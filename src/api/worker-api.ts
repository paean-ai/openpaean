/**
 * Worker API
 * Heartbeat and status functions used by the Gateway service.
 *
 * Task polling/claiming/completion functions were removed — the autonomous
 * WorkerService that consumed them has been replaced by loop + gateway.
 */

import type { AxiosInstance } from 'axios';
import { createNonClearingApiClient } from './client.js';

let cachedClient: AxiosInstance | null = null;

function getWorkerApiClient(): AxiosInstance {
    if (!cachedClient) {
        cachedClient = createNonClearingApiClient();
    }
    return cachedClient;
}

// ============================================
// Types
// ============================================

export type WorkerStatus = 'idle' | 'running' | 'paused';

export interface WorkerHeartbeatInput {
    status: WorkerStatus;
    currentTaskId?: string;
    completedCount?: number;
    failedCount?: number;
    workingDirectory?: string;
    capabilities?: string[];
}

// ============================================
// API Functions
// ============================================

/**
 * Send Worker heartbeat
 */
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
