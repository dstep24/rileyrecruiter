/**
 * Task Repository - Data access for Tasks
 *
 * Tasks are the core of the Two-Loop System.
 * Handles sandbox (draft) vs effectful operations.
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type { Task, Prisma } from '../../generated/prisma/index.js';
import { BaseRepository, RepositoryError } from './BaseRepository.js';

// =============================================================================
// TYPES
// =============================================================================

export type TaskCreateInput = Prisma.TaskCreateInput;
export type TaskUpdateInput = Prisma.TaskUpdateInput;
export type TaskWhereInput = Prisma.TaskWhereInput;
export type TaskWhereUniqueInput = Prisma.TaskWhereUniqueInput;

export type TaskType = Prisma.TaskType;
export type TaskStatus = Prisma.TaskStatus;
export type EscalationReason = Prisma.EscalationReason;
export type Priority = Prisma.Priority;

// =============================================================================
// REPOSITORY
// =============================================================================

export class TaskRepository extends BaseRepository<
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  TaskWhereInput,
  TaskWhereUniqueInput
> {
  protected modelName = 'Task';

  protected getDelegate() {
    return this.db.task;
  }

  /**
   * Get pending approval tasks for a tenant
   */
  async getPendingApproval(tenantId: string): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        tenantId,
        status: 'PENDING_APPROVAL',
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Get pending approval count
   */
  async getPendingApprovalCount(tenantId: string): Promise<number> {
    return this.db.task.count({
      where: {
        tenantId,
        status: 'PENDING_APPROVAL',
      },
    });
  }

  /**
   * Get pending approval tasks with filters
   */
  async findPendingApproval(
    tenantId?: string,
    filters?: {
      types?: TaskType[];
      priorities?: Priority[];
      escalationReasons?: EscalationReason[];
      limit?: number;
      offset?: number;
    }
  ): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        ...(tenantId && { tenantId }),
        status: 'PENDING_APPROVAL',
        ...(filters?.types && { type: { in: filters.types } }),
        ...(filters?.priorities && { priority: { in: filters.priorities } }),
        ...(filters?.escalationReasons && { escalationReason: { in: filters.escalationReasons } }),
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: filters?.limit,
      skip: filters?.offset,
    });
  }

  /**
   * Assign a task to a teleoperator
   */
  async assign(taskId: string, teleoperatorId: string): Promise<Task> {
    return this.db.task.update({
      where: { id: taskId },
      data: {
        approvedBy: teleoperatorId, // Reusing approvedBy for assignment
      },
    });
  }

  /**
   * Unassign a task
   */
  async unassign(taskId: string): Promise<Task> {
    return this.db.task.update({
      where: { id: taskId },
      data: {
        approvedBy: null,
      },
    });
  }

  /**
   * Get tasks assigned to a teleoperator
   */
  async findAssigned(teleoperatorId: string): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        status: 'PENDING_APPROVAL',
        approvedBy: teleoperatorId,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Update task payload
   */
  async updatePayload(taskId: string, payload: unknown): Promise<Task> {
    return this.db.task.update({
      where: { id: taskId },
      data: {
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Get tasks by status
   */
  async getByStatus(tenantId: string, status: TaskStatus): Promise<Task[]> {
    return this.db.task.findMany({
      where: { tenantId, status },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get tasks by type
   */
  async getByType(tenantId: string, type: TaskType): Promise<Task[]> {
    return this.db.task.findMany({
      where: { tenantId, type },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Create a draft task (sandbox operation)
   */
  async createDraft(
    tenantId: string,
    data: {
      type: TaskType;
      payload: Prisma.InputJsonValue;
      requisitionId?: string;
      innerLoopId?: string;
      iterations?: number;
      converged?: boolean;
      priority?: Priority;
    }
  ): Promise<Task> {
    return this.db.task.create({
      data: {
        tenantId,
        type: data.type,
        payload: data.payload,
        requisitionId: data.requisitionId,
        innerLoopId: data.innerLoopId,
        iterations: data.iterations ?? 0,
        converged: data.converged ?? false,
        status: 'DRAFT',
        effectful: false,
        priority: data.priority ?? 'MEDIUM',
      },
    });
  }

  /**
   * Queue a task for approval (effectful operation)
   */
  async queueForApproval(
    taskId: string,
    escalationReason?: EscalationReason
  ): Promise<Task> {
    const task = await this.findByIdOrThrow(taskId);

    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: 'PENDING_APPROVAL',
        effectful: true,
        escalationReason,
      },
    });
  }

  /**
   * Approve a task
   */
  async approve(taskId: string, approvedBy: string): Promise<Task> {
    const task = await this.findByIdOrThrow(taskId);

    if (task.status !== 'PENDING_APPROVAL') {
      throw new RepositoryError(
        `Task ${taskId} is not pending approval`,
        'VALIDATION'
      );
    }

    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: 'APPROVED',
        approvedBy,
        approvedAt: new Date(),
      },
    });
  }

  /**
   * Reject a task
   */
  async reject(
    taskId: string,
    rejectedBy: string,
    reason?: string
  ): Promise<Task> {
    const task = await this.findByIdOrThrow(taskId);

    if (task.status !== 'PENDING_APPROVAL') {
      throw new RepositoryError(
        `Task ${taskId} is not pending approval`,
        'VALIDATION'
      );
    }

    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: 'REJECTED',
        rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: reason,
      },
    });
  }

  /**
   * Mark task as executing
   */
  async markExecuting(taskId: string): Promise<Task> {
    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: 'EXECUTING',
      },
    });
  }

  /**
   * Mark task as completed
   */
  async markCompleted(
    taskId: string,
    result?: Prisma.InputJsonValue
  ): Promise<Task> {
    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: 'COMPLETED',
        executedAt: new Date(),
        executionResult: result ?? undefined,
      },
    });
  }

  /**
   * Mark task as failed
   */
  async markFailed(taskId: string, error: string): Promise<Task> {
    return this.db.task.update({
      where: { id: taskId },
      data: {
        status: 'FAILED',
        executedAt: new Date(),
        executionError: error,
      },
    });
  }

  /**
   * Get tasks ready for execution
   */
  async getReadyForExecution(tenantId: string, limit = 10): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        tenantId,
        status: 'APPROVED',
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
      },
      orderBy: [{ priority: 'desc' }, { approvedAt: 'asc' }],
      take: limit,
    });
  }

  /**
   * Get scheduled tasks
   */
  async getScheduled(tenantId: string): Promise<Task[]> {
    return this.db.task.findMany({
      where: {
        tenantId,
        status: 'APPROVED',
        scheduledFor: { gt: new Date() },
      },
      orderBy: { scheduledFor: 'asc' },
    });
  }

  /**
   * Expire old tasks
   */
  async expireOldTasks(): Promise<number> {
    const result = await this.db.task.updateMany({
      where: {
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'] },
        expiresAt: { lt: new Date() },
      },
      data: {
        status: 'EXPIRED',
      },
    });

    return result.count;
  }

  /**
   * Get task statistics for a tenant
   */
  async getStatistics(tenantId: string): Promise<TaskStatistics> {
    const [
      total,
      pending,
      approved,
      completed,
      failed,
      rejected,
    ] = await Promise.all([
      this.count({ tenantId }),
      this.count({ tenantId, status: 'PENDING_APPROVAL' }),
      this.count({ tenantId, status: 'APPROVED' }),
      this.count({ tenantId, status: 'COMPLETED' }),
      this.count({ tenantId, status: 'FAILED' }),
      this.count({ tenantId, status: 'REJECTED' }),
    ]);

    return {
      total,
      pending,
      approved,
      completed,
      failed,
      rejected,
      completionRate: total > 0 ? completed / total : 0,
      approvalRate: pending + approved + completed + rejected > 0
        ? (approved + completed) / (pending + approved + completed + rejected)
        : 0,
    };
  }
}

// =============================================================================
// STATISTICS TYPE
// =============================================================================

export interface TaskStatistics {
  total: number;
  pending: number;
  approved: number;
  completed: number;
  failed: number;
  rejected: number;
  completionRate: number;
  approvalRate: number;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: TaskRepository | null = null;

export function getTaskRepository(): TaskRepository {
  if (!instance) {
    instance = new TaskRepository();
  }
  return instance;
}
