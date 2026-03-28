/**
 * Gateway API
 * Client functions for OpenPaean CLI Gateway operations.
 * Uses a non-clearing API client so that transient 401 errors
 * don't invalidate user auth.
 */

import type { AxiosInstance } from 'axios';
import { createNonClearingApiClient } from './client.js';

let cachedClient: AxiosInstance | null = null;

function getClient(): AxiosInstance {
    if (!cachedClient) {
        cachedClient = createNonClearingApiClient();
    }
    return cachedClient;
}

// ============================================
// Types
// ============================================

export interface GatewayRequest {
    requestId: string;
    conversationId: number;
    conversationHashKey?: string;
    message: string;
    references?: Array<{ type: string; hashKey: string; title: string }>;
    clientType: string;
    createdAt: string;
}

export interface GatewayStreamEvent {
    type: string;
    data: Record<string, unknown>;
}

export interface GatewayCompletionResult {
    content: string;
    toolCalls?: unknown[];
    error?: string;
}

// ============================================
// API Functions
// ============================================

export async function pollGatewayRequests(
    sessionId: string,
    limit: number = 5
): Promise<{ requests: GatewayRequest[]; count: number }> {
    const client = getClient();
    const response = await client.post<{
        success: boolean;
        data: { requests: GatewayRequest[]; count: number };
    }>('/agent/gateway/poll', { sessionId, limit });
    return response.data.data;
}

export async function claimGatewayRequest(
    requestId: string,
    sessionId: string,
    deviceName?: string
): Promise<{ success: boolean; request?: GatewayRequest; error?: string }> {
    const client = getClient();
    const response = await client.post<{
        success: boolean;
        request?: GatewayRequest;
        error?: string;
    }>(`/agent/gateway/claim/${requestId}`, { sessionId, deviceName });
    return response.data;
}

export async function pushGatewayEvents(
    requestId: string,
    sessionId: string,
    events: GatewayStreamEvent[]
): Promise<{ success: boolean; error?: string }> {
    const client = getClient();
    try {
        const response = await client.post<{ success: boolean; error?: string }>(
            `/agent/gateway/events/${requestId}`,
            { sessionId, events }
        );
        return response.data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

export async function completeGatewayRequest(
    requestId: string,
    sessionId: string,
    result: GatewayCompletionResult
): Promise<{ success: boolean; error?: string }> {
    const client = getClient();
    try {
        const response = await client.post<{ success: boolean; error?: string }>(
            `/agent/gateway/complete/${requestId}`,
            { sessionId, result }
        );
        return response.data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Register this CLI gateway instance with the cloud backend.
 */
export async function registerGatewayInstance(
    sessionId: string,
    deviceName: string,
    meta: {
        capabilities?: string[];
        workingDirectory?: string;
        platform?: string;
        cliVersion?: string;
        sessionName?: string;
    } = {}
): Promise<{ success: boolean; error?: string }> {
    const client = getClient();
    try {
        const response = await client.post<{ success: boolean; error?: string }>(
            '/agent/gateway/register',
            {
                sessionId,
                deviceName,
                sessionName: meta.sessionName,
                capabilities: meta.capabilities || ['gateway', 'mcp'],
                workingDirectory: meta.workingDirectory,
                platform: meta.platform,
                cliVersion: meta.cliVersion,
            }
        );
        return response.data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}

/**
 * Unregister this CLI gateway instance from the cloud backend.
 */
export async function unregisterGatewayInstance(
    sessionId: string
): Promise<{ success: boolean; error?: string }> {
    const client = getClient();
    try {
        const response = await client.delete<{ success: boolean; error?: string }>(
            '/agent/gateway/register',
            { data: { sessionId } }
        );
        return response.data;
    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
}
