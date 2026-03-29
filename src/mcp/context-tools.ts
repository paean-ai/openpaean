/**
 * Context Management MCP Tools
 *
 * Provides tools that let the agent programmatically manage its own
 * conversation context — clearing or compacting it. This is essential for
 * loop/scheduled tasks that need a clean context between iterations.
 *
 * Uses an EventEmitter pattern (same as loop.ts) so the tool execution
 * can signal the React hook (useAgentStream) to reset conversationId.
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';
import { EventEmitter } from 'events';

// ============================================
// Types
// ============================================

export interface ContextActionEvent {
  action: 'clear' | 'compact';
  /** Agent-provided summary of what was accomplished (used by compact) */
  summary?: string;
  /** Reason the agent is performing this action */
  reason?: string;
}

// ============================================
// Event Bus
// ============================================

const contextEmitter = new EventEmitter();
contextEmitter.setMaxListeners(20);

/**
 * Register a callback that fires when the agent requests a context action.
 * Returns an unsubscribe function.
 */
export function onContextAction(
  callback: (event: ContextActionEvent) => void,
): () => void {
  contextEmitter.on('context-action', callback);
  return () => {
    contextEmitter.off('context-action', callback);
  };
}

// ============================================
// Stored compact summary (carry-forward)
// ============================================

let pendingCompactSummary: string | null = null;

/**
 * Consume the pending compact summary (if any). Returns the summary string
 * and clears it so it's only used once.
 */
export function consumeCompactSummary(): string | null {
  const summary = pendingCompactSummary;
  pendingCompactSummary = null;
  return summary;
}

// ============================================
// MCP Tool Definitions
// ============================================

export function getContextToolDefinitions(): Tool[] {
  return [
    {
      name: 'paean_context_clear',
      description:
        'Clear the current conversation context entirely. ' +
        'The next message will start a brand-new conversation with no history. ' +
        'Use this after completing a loop task iteration to ensure clean context ' +
        'for the next run, or when the conversation has become too large/noisy. ' +
        'This is equivalent to the user typing /clear.',
      inputSchema: {
        type: 'object',
        properties: {
          reason: {
            type: 'string',
            description:
              'Brief reason for clearing context (e.g. "loop iteration complete", "context too large")',
          },
        },
      },
    },
    {
      name: 'paean_context_compact',
      description:
        'Compact the current conversation by summarizing it. ' +
        'Provide a concise summary of key facts, decisions, and outcomes from the conversation so far. ' +
        'The current conversation will be replaced with a fresh one that starts with your summary as context. ' +
        'Use this instead of paean_context_clear when you need to preserve important context ' +
        'while reducing token usage. Good for long-running sessions or between loop iterations ' +
        'where some state must carry forward.',
      inputSchema: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description:
              'Concise summary of the conversation so far — key facts, decisions, outcomes, ' +
              'and any state that should carry forward into the next conversation turn.',
          },
          reason: {
            type: 'string',
            description:
              'Brief reason for compacting (e.g. "preserve state between loop iterations")',
          },
        },
        required: ['summary'],
      },
    },
  ];
}

export const CONTEXT_TOOL_NAMES = new Set([
  'paean_context_clear',
  'paean_context_compact',
]);

// ============================================
// MCP Tool Execution
// ============================================

export async function executeContextTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  switch (toolName) {
    case 'paean_context_clear': {
      const reason = (args.reason as string) || 'Agent requested context clear';

      contextEmitter.emit('context-action', {
        action: 'clear',
        reason,
      } satisfies ContextActionEvent);

      return {
        success: true,
        message:
          'Context will be cleared after this turn completes. ' +
          'The next message will start a fresh conversation.',
        reason,
      };
    }

    case 'paean_context_compact': {
      const summary = args.summary as string;
      const reason = (args.reason as string) || 'Agent requested context compaction';

      if (!summary) {
        return {
          success: false,
          error: 'summary is required for context compaction',
        };
      }

      pendingCompactSummary = summary;

      contextEmitter.emit('context-action', {
        action: 'compact',
        summary,
        reason,
      } satisfies ContextActionEvent);

      return {
        success: true,
        message:
          'Context will be compacted after this turn completes. ' +
          'The next conversation will start with your summary as initial context.',
        summaryLength: summary.length,
        reason,
      };
    }

    default:
      return { success: false, error: `Unknown context tool: ${toolName}` };
  }
}
