/**
 * Todo API
 * Wrapper for Paean AI todo/task management endpoints
 */

import { getApiClient } from './client.js';

/** Subtask/checklist item within a todo */
export interface ChecklistItem {
  id: string;
  content: string;
  completed: boolean;
  order?: number;
  createdAt?: string;
  completedAt?: string;
}

export interface TodoItem {
  id: string;
  content: string;
  description?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  dueDate?: string;
  tags?: string[];
  sourceNoteHashKey?: string;
  sourceContext?: string;
  metadata?: Record<string, unknown>;
  order?: number;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  /** Subtasks/checklist items */
  checklist?: ChecklistItem[];
}

export interface TodoListResponse {
  success: boolean;
  data: {
    items: TodoItem[];
    stats: {
      total: number;
      completed: number;
      pending: number;
      overdue?: number;
      dueToday?: number;
    };
    lastProcessedAt?: string;
  };
}

export interface PendingChange {
  id: number;
  status: 'pending' | 'accepted' | 'rejected' | 'partial';
  summary: string;
  changeCount: number;
  operationCounts: {
    add: number;
    update: number;
    complete: number;
    delete: number;
  };
  sourceNoteHashKey?: string;
  sourceNoteTitle?: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
}

export interface PendingChangesResponse {
  success: boolean;
  data: PendingChange[];
}

export interface TodoPreferences {
  todoEnabled: boolean;
  todoAutoProcess: boolean;
  todoDefaultPriority: 'high' | 'medium' | 'low';
  turboModeEnabled: boolean;
}

/**
 * Get todo list with optional filters
 */
export async function getTodoList(options?: {
  status?: 'all' | 'pending' | 'completed' | 'in_progress' | 'cancelled';
  priority?: 'high' | 'medium' | 'low';
}): Promise<TodoListResponse> {
  const client = getApiClient();
  const params = new URLSearchParams();

  if (options?.status && options.status !== 'all') {
    params.append('status', options.status);
  }
  if (options?.priority) {
    params.append('priority', options.priority);
  }

  const response = await client.get<TodoListResponse>(`/todo?${params.toString()}`);
  return response.data;
}

/**
 * Get a specific todo item by ID
 */
export async function getTodoItem(id: string): Promise<{ success: boolean; data: TodoItem }> {
  const list = await getTodoList();
  const item = list.data.items.find((i) => i.id === id);

  if (!item) {
    throw new Error(`Todo item not found: ${id}`);
  }

  return { success: true, data: item };
}

/**
 * Create a new todo item
 */
export async function createTodoItem(data: {
  content: string;
  description?: string;
  priority?: 'high' | 'medium' | 'low';
  status?: 'pending' | 'in_progress';
  dueDate?: string;
  tags?: string[];
  sourceContext?: string;
  /** Subtask contents - will be converted to checklist items */
  subtasks?: string[];
}): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();
  
  // Convert subtask strings to checklist items if provided
  const checklist = data.subtasks?.map((content, index) => ({
    id: `sub-${Date.now()}-${index}`,
    content,
    completed: false,
    order: index,
    createdAt: new Date().toISOString(),
  }));

  const payload = {
    ...data,
    checklist,
  };
  // Remove subtasks from payload as we've converted it
  delete (payload as Record<string, unknown>).subtasks;

  const response = await client.post<{ success: boolean; data: TodoItem }>('/todo/items', payload);
  return response.data;
}

/**
 * Update a todo item
 */
export async function updateTodoItem(
  id: string,
  data: Partial<{
    content: string;
    priority: 'high' | 'medium' | 'low';
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    dueDate: string;
    tags: string[];
    order: number;
    metadata: Record<string, unknown>;
  }>
): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();
  const response = await client.put<{ success: boolean; data: TodoItem }>(`/todo/items/${id}`, data);
  return response.data;
}

/**
 * Complete a todo item
 */
export async function completeTodoItem(
  id: string,
  summary?: string
): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();

  // First complete the item
  const response = await client.post<{ success: boolean; data: TodoItem }>(
    `/todo/items/${id}/complete`
  );

  // If summary provided, add it to metadata
  if (summary && response.data.success) {
    await updateTodoItem(id, {
      metadata: {
        ...response.data.data.metadata,
        completionSummary: summary,
        completedAt: new Date().toISOString(),
      },
    });
  }

  return response.data;
}

/**
 * Reopen a completed/cancelled todo item
 */
export async function reopenTodoItem(id: string): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();
  const response = await client.post<{ success: boolean; data: TodoItem }>(
    `/todo/items/${id}/reopen`
  );
  return response.data;
}

/**
 * Delete a todo item
 */
export async function deleteTodoItem(id: string): Promise<{ success: boolean }> {
  const client = getApiClient();
  const response = await client.delete<{ success: boolean }>(`/todo/items/${id}`);
  return response.data;
}

/**
 * Get pending changes from LLM analysis
 */
export async function getPendingChanges(
  status: 'pending' | 'all' = 'pending'
): Promise<PendingChangesResponse> {
  const client = getApiClient();
  const response = await client.get<PendingChangesResponse>(`/todo/pending?status=${status}`);
  return response.data;
}

/**
 * Accept a pending change
 */
export async function acceptPendingChange(changeId: number): Promise<{ success: boolean }> {
  const client = getApiClient();
  const response = await client.post<{ success: boolean }>(`/todo/pending/${changeId}/accept`);
  return response.data;
}

/**
 * Reject a pending change
 */
export async function rejectPendingChange(
  changeId: number,
  notes?: string
): Promise<{ success: boolean }> {
  const client = getApiClient();
  const response = await client.post<{ success: boolean }>(`/todo/pending/${changeId}/reject`, {
    notes,
  });
  return response.data;
}

/**
 * Get todo preferences
 */
export async function getTodoPreferences(): Promise<{
  success: boolean;
  data: TodoPreferences;
}> {
  const client = getApiClient();
  const response = await client.get<{ success: boolean; data: TodoPreferences }>(
    '/todo/preferences'
  );
  return response.data;
}

/**
 * Update todo preferences
 */
export async function updateTodoPreferences(
  prefs: Partial<TodoPreferences>
): Promise<{ success: boolean; data: TodoPreferences }> {
  const client = getApiClient();
  const response = await client.put<{ success: boolean; data: TodoPreferences }>(
    '/todo/preferences',
    prefs
  );
  return response.data;
}

/**
 * Analyze content for todos (manual trigger)
 */
export async function analyzeTodos(
  content: string,
  options?: {
    context?: string;
    autoAccept?: boolean;
  }
): Promise<{
  success: boolean;
  data: {
    pendingChangeId?: number;
    changes?: unknown[];
    summary?: string;
  };
}> {
  const client = getApiClient();
  const response = await client.post('/todo/analyze', {
    content,
    context: options?.context,
    autoAccept: options?.autoAccept,
  });
  return response.data;
}

// ============================================
// Subtask/Checklist Management
// ============================================

/**
 * Add a subtask to an existing todo item
 */
export async function addSubtask(
  taskId: string,
  content: string
): Promise<{ success: boolean; data: TodoItem; subtaskId?: string }> {
  const client = getApiClient();
  const response = await client.post<{ success: boolean; data: TodoItem; subtaskId?: string }>(
    `/todo/items/${taskId}/subtasks`,
    { content }
  );
  return response.data;
}

/**
 * Complete a subtask
 */
export async function completeSubtask(
  taskId: string,
  subtaskId: string
): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();
  const response = await client.post<{ success: boolean; data: TodoItem }>(
    `/todo/items/${taskId}/subtasks/${subtaskId}/complete`
  );
  return response.data;
}

/**
 * Update a subtask
 */
export async function updateSubtask(
  taskId: string,
  subtaskId: string,
  updates: { content?: string; completed?: boolean }
): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();
  const response = await client.put<{ success: boolean; data: TodoItem }>(
    `/todo/items/${taskId}/subtasks/${subtaskId}`,
    updates
  );
  return response.data;
}

/**
 * Delete a subtask
 */
export async function deleteSubtask(
  taskId: string,
  subtaskId: string
): Promise<{ success: boolean; data: TodoItem }> {
  const client = getApiClient();
  const response = await client.delete<{ success: boolean; data: TodoItem }>(
    `/todo/items/${taskId}/subtasks/${subtaskId}`
  );
  return response.data;
}

/**
 * Get subtask progress for a task
 */
export function getSubtaskProgress(item: TodoItem): {
  total: number;
  completed: number;
  percentage: number;
} {
  const checklist = item.checklist || [];
  const total = checklist.length;
  const completed = checklist.filter((s) => s.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { total, completed, percentage };
}
