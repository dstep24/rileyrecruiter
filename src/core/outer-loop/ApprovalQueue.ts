/**
 * Approval Queue - Managing Teleoperator Review Queue
 *
 * The interface between autonomous agent output and human oversight.
 * Manages tasks waiting for teleoperator approval, rejection, or editing.
 *
 * Key Two-Loop Concepts:
 * - Tasks enter queue when escalated or effectful
 * - Teleoperators can approve, reject, or edit
 * - Approved tasks proceed to execution
 * - Feedback loops back to Guidelines/Criteria updates
 */

import { v4 as uuid } from 'uuid';
import { getTaskRepository, TaskRepository } from '../../domain/repositories/TaskRepository.js';
import { getQueueManager, QUEUE_NAMES } from '../../infrastructure/queue/TaskQueue.js';
import type {
  Task,
  TaskType,
  TaskStatus,
  Priority,
  EscalationReason,
} from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface QueuedTask {
  id: string;
  tenantId: string;
  type: TaskType;
  status: TaskStatus;
  priority: Priority;
  escalationReason: EscalationReason | null;

  // Content
  payload: unknown;
  generatedOutput?: unknown;

  // Context
  candidateName?: string;
  requisitionTitle?: string;
  conversationContext?: string;

  // Metadata
  innerLoopIterations?: number;
  confidenceScore?: number;
  queuedAt: Date;
  expiresAt: Date | null;

  // Assignment
  assignedTo?: string;
  assignedAt?: Date;
}

export interface ApprovalDecision {
  taskId: string;
  decision: 'approve' | 'reject' | 'edit';
  teleoperatorId: string;
  editedContent?: unknown;
  rejectionReason?: string;
  feedback?: string;
  suggestGuidelinesUpdate?: boolean;
  suggestCriteriaUpdate?: boolean;
}

export interface QueueStats {
  totalPending: number;
  byPriority: Record<Priority, number>;
  byType: Record<string, number>;
  byEscalationReason: Record<string, number>;
  avgWaitTimeMinutes: number;
  oldestTaskMinutes: number;
}

export interface QueueFilter {
  tenantId?: string;
  types?: TaskType[];
  priorities?: Priority[];
  escalationReasons?: EscalationReason[];
  assignedTo?: string;
  unassignedOnly?: boolean;
  limit?: number;
  offset?: number;
}

// =============================================================================
// APPROVAL QUEUE
// =============================================================================

export class ApprovalQueue {
  private taskRepo: TaskRepository;

  constructor(taskRepo?: TaskRepository) {
    this.taskRepo = taskRepo || getTaskRepository();
  }

  // ===========================================================================
  // QUEUE OPERATIONS
  // ===========================================================================

  /**
   * Get pending tasks for review
   */
  async getPendingTasks(filter: QueueFilter = {}): Promise<QueuedTask[]> {
    const tasks = await this.taskRepo.findPendingApproval(filter.tenantId, {
      types: filter.types,
      priorities: filter.priorities,
      escalationReasons: filter.escalationReasons,
      limit: filter.limit || 50,
      offset: filter.offset || 0,
    });

    return tasks.map((task) => this.toQueuedTask(task));
  }

  /**
   * Get a single task with full context
   */
  async getTaskWithContext(taskId: string): Promise<QueuedTask | null> {
    const task = await this.taskRepo.findById(taskId);
    if (!task) return null;

    // Enrich with context
    const queuedTask = this.toQueuedTask(task);

    // Load additional context (in production, would query related entities)
    // queuedTask.candidateName = await this.loadCandidateName(task.candidateId);
    // queuedTask.requisitionTitle = await this.loadRequisitionTitle(task.requisitionId);

    return queuedTask;
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(tenantId?: string): Promise<QueueStats> {
    const tasks = await this.taskRepo.findPendingApproval(tenantId);

    const stats: QueueStats = {
      totalPending: tasks.length,
      byPriority: { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
      byType: {},
      byEscalationReason: {},
      avgWaitTimeMinutes: 0,
      oldestTaskMinutes: 0,
    };

    const now = new Date();
    let totalWaitTime = 0;
    let oldestWait = 0;

    for (const task of tasks) {
      // Count by priority
      stats.byPriority[task.priority]++;

      // Count by type
      stats.byType[task.type] = (stats.byType[task.type] || 0) + 1;

      // Count by escalation reason
      if (task.escalationReason) {
        stats.byEscalationReason[task.escalationReason] =
          (stats.byEscalationReason[task.escalationReason] || 0) + 1;
      }

      // Calculate wait time
      const waitMs = now.getTime() - task.createdAt.getTime();
      const waitMinutes = waitMs / (1000 * 60);
      totalWaitTime += waitMinutes;

      if (waitMinutes > oldestWait) {
        oldestWait = waitMinutes;
      }
    }

    stats.avgWaitTimeMinutes = tasks.length > 0 ? totalWaitTime / tasks.length : 0;
    stats.oldestTaskMinutes = oldestWait;

    return stats;
  }

  // ===========================================================================
  // ASSIGNMENT
  // ===========================================================================

  /**
   * Assign a task to a teleoperator
   */
  async assignTask(taskId: string, teleoperatorId: string): Promise<void> {
    await this.taskRepo.assign(taskId, teleoperatorId);
  }

  /**
   * Unassign a task
   */
  async unassignTask(taskId: string): Promise<void> {
    await this.taskRepo.unassign(taskId);
  }

  /**
   * Get tasks assigned to a specific teleoperator
   */
  async getAssignedTasks(teleoperatorId: string): Promise<QueuedTask[]> {
    const tasks = await this.taskRepo.findAssigned(teleoperatorId);
    return tasks.map((task) => this.toQueuedTask(task));
  }

  /**
   * Auto-assign tasks based on workload
   */
  async autoAssign(
    tenantId: string,
    teleoperators: string[],
    maxPerOperator: number = 10
  ): Promise<Map<string, string[]>> {
    const assignments = new Map<string, string[]>();
    teleoperators.forEach((id) => assignments.set(id, []));

    // Get unassigned tasks
    const tasks = await this.getPendingTasks({
      tenantId,
      unassignedOnly: true,
    });

    // Sort by priority
    const priorityOrder: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
    tasks.sort((a, b) => {
      return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
    });

    // Round-robin assignment
    let operatorIndex = 0;
    for (const task of tasks) {
      // Find next available operator
      let attempts = 0;
      while (attempts < teleoperators.length) {
        const operatorId = teleoperators[operatorIndex];
        const currentAssignments = assignments.get(operatorId) || [];

        if (currentAssignments.length < maxPerOperator) {
          await this.assignTask(task.id, operatorId);
          currentAssignments.push(task.id);
          assignments.set(operatorId, currentAssignments);
          break;
        }

        operatorIndex = (operatorIndex + 1) % teleoperators.length;
        attempts++;
      }

      operatorIndex = (operatorIndex + 1) % teleoperators.length;
    }

    return assignments;
  }

  // ===========================================================================
  // DECISIONS
  // ===========================================================================

  /**
   * Process an approval decision
   */
  async processDecision(decision: ApprovalDecision): Promise<void> {
    const task = await this.taskRepo.findByIdOrThrow(decision.taskId);

    switch (decision.decision) {
      case 'approve':
        await this.handleApproval(task, decision);
        break;

      case 'reject':
        await this.handleRejection(task, decision);
        break;

      case 'edit':
        await this.handleEdit(task, decision);
        break;
    }

    // Process feedback for Guidelines/Criteria updates
    if (decision.feedback) {
      await this.processFeedback(task, decision);
    }
  }

  /**
   * Batch approve multiple tasks
   */
  async batchApprove(taskIds: string[], teleoperatorId: string): Promise<{
    approved: string[];
    failed: Array<{ taskId: string; error: string }>;
  }> {
    const approved: string[] = [];
    const failed: Array<{ taskId: string; error: string }> = [];

    for (const taskId of taskIds) {
      try {
        await this.processDecision({
          taskId,
          decision: 'approve',
          teleoperatorId,
        });
        approved.push(taskId);
      } catch (error) {
        failed.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { approved, failed };
  }

  /**
   * Batch reject multiple tasks
   */
  async batchReject(
    taskIds: string[],
    teleoperatorId: string,
    reason: string
  ): Promise<{
    rejected: string[];
    failed: Array<{ taskId: string; error: string }>;
  }> {
    const rejected: string[] = [];
    const failed: Array<{ taskId: string; error: string }> = [];

    for (const taskId of taskIds) {
      try {
        await this.processDecision({
          taskId,
          decision: 'reject',
          teleoperatorId,
          rejectionReason: reason,
        });
        rejected.push(taskId);
      } catch (error) {
        failed.push({
          taskId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { rejected, failed };
  }

  // ===========================================================================
  // DECISION HANDLERS
  // ===========================================================================

  private async handleApproval(task: Task, decision: ApprovalDecision): Promise<void> {
    // Update task status
    await this.taskRepo.approve(task.id, decision.teleoperatorId);

    // Queue for execution
    const queueManager = getQueueManager();
    await queueManager.addJob(QUEUE_NAMES.TASK_EXECUTION, {
      type: 'task-execution',
      tenantId: task.tenantId,
      taskId: task.id,
    });

    console.log(`[ApprovalQueue] Task ${task.id} approved by ${decision.teleoperatorId}`);
  }

  private async handleRejection(task: Task, decision: ApprovalDecision): Promise<void> {
    // Update task status
    await this.taskRepo.reject(
      task.id,
      decision.teleoperatorId,
      decision.rejectionReason || 'No reason provided'
    );

    // Notify relevant parties
    const queueManager = getQueueManager();
    await queueManager.addJob(QUEUE_NAMES.NOTIFICATIONS, {
      type: 'notification',
      tenantId: task.tenantId,
      channel: 'dashboard',
      payload: {
        type: 'task_rejected',
        taskId: task.id,
        taskType: task.type,
        reason: decision.rejectionReason,
      },
    });

    console.log(`[ApprovalQueue] Task ${task.id} rejected by ${decision.teleoperatorId}`);
  }

  private async handleEdit(task: Task, decision: ApprovalDecision): Promise<void> {
    if (!decision.editedContent) {
      throw new Error('Edit decision requires editedContent');
    }

    // Update the task with edited content
    await this.taskRepo.updatePayload(task.id, decision.editedContent);

    // Then approve the edited version
    await this.handleApproval(task, decision);

    console.log(`[ApprovalQueue] Task ${task.id} edited and approved by ${decision.teleoperatorId}`);
  }

  // ===========================================================================
  // FEEDBACK PROCESSING
  // ===========================================================================

  private async processFeedback(task: Task, decision: ApprovalDecision): Promise<void> {
    const queueManager = getQueueManager();

    // Queue Guidelines update if suggested
    if (decision.suggestGuidelinesUpdate) {
      await queueManager.addJob(QUEUE_NAMES.INNER_LOOP, {
        type: 'inner-loop',
        tenantId: task.tenantId,
        taskId: task.id,
        subtype: 'guidelines-feedback',
        feedback: decision.feedback,
        decisionType: decision.decision,
      });
    }

    // Queue Criteria update if suggested
    if (decision.suggestCriteriaUpdate) {
      await queueManager.addJob(QUEUE_NAMES.INNER_LOOP, {
        type: 'inner-loop',
        tenantId: task.tenantId,
        taskId: task.id,
        subtype: 'criteria-feedback',
        feedback: decision.feedback,
        decisionType: decision.decision,
      });
    }
  }

  // ===========================================================================
  // EXPIRATION
  // ===========================================================================

  /**
   * Process expired tasks
   */
  async processExpiredTasks(): Promise<number> {
    const expiredCount = await this.taskRepo.expireOldTasks();

    if (expiredCount > 0) {
      console.log(`[ApprovalQueue] Expired ${expiredCount} tasks`);
    }

    return expiredCount;
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private toQueuedTask(task: Task): QueuedTask {
    return {
      id: task.id,
      tenantId: task.tenantId,
      type: task.type,
      status: task.status,
      priority: task.priority,
      escalationReason: task.escalationReason,
      payload: task.payload,
      generatedOutput: task.executionResult,
      innerLoopIterations: task.iterations,
      queuedAt: task.createdAt,
      expiresAt: task.expiresAt,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: ApprovalQueue | null = null;

export function getApprovalQueue(): ApprovalQueue {
  if (!instance) {
    instance = new ApprovalQueue();
  }
  return instance;
}

export function resetApprovalQueue(): void {
  instance = null;
}
