/**
 * Task Orchestrator - Routing Tasks Through the Two-Loop System
 *
 * The central coordinator that:
 * 1. Receives task requests
 * 2. Routes to inner loop for generation
 * 3. Determines if output needs escalation
 * 4. Queues for approval or auto-approves
 * 5. Manages execution of approved tasks
 *
 * Key Two-Loop Concepts:
 * - Sandbox: Tasks that don't affect the real world (drafts)
 * - Effectful: Tasks that have real-world impact (require approval)
 */

import { v4 as uuid } from 'uuid';
import { getInnerLoopEngine, InnerLoopEngine } from '../inner-loop/InnerLoopEngine.js';
import { getEscalationManager, EscalationManager } from '../outer-loop/EscalationManager.js';
import { getTaskRepository, TaskRepository } from '../../domain/repositories/TaskRepository.js';
import { getQueueManager, QUEUE_NAMES } from '../../infrastructure/queue/TaskQueue.js';
import type { InnerLoopContext, InnerLoopResult } from '../../domain/entities/InnerLoop.js';
import type { TaskType, TaskStatus, Priority, EscalationReason } from '../../generated/prisma/index.js';
import type { TenantConfig, DEFAULT_TENANT_CONFIG } from '../../domain/entities/Tenant.js';
import { isEffectfulTaskType, SANDBOX_TASK_TYPES } from '../../domain/entities/Task.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TaskRequest {
  tenantId: string;
  type: TaskType;
  input: TaskInput;
  priority?: Priority;
  scheduledFor?: Date;
  metadata?: Record<string, unknown>;
}

export type ConstraintType = 'must_include' | 'must_exclude' | 'format' | 'length' | 'custom';

export interface TaskInput {
  requisitionId?: string;
  candidateId?: string;
  conversationId?: string;
  data: Record<string, unknown>;
  constraints?: Array<{
    type: ConstraintType;
    description: string;
    config: Record<string, unknown>;
  }>;
}

export interface TaskResult {
  taskId: string;
  status: TaskStatus;
  output?: unknown;
  escalated: boolean;
  escalationReason?: EscalationReason;
  innerLoopResult?: InnerLoopResult;
}

export interface OrchestratorConfig {
  // Auto-approval settings
  autoApprovalEnabled: boolean;
  autoApprovalThreshold: number;
  maxAutoApprovalsPerDay: number;

  // Execution settings
  maxConcurrentExecutions: number;
  executionTimeoutMs: number;

  // Retry settings
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_CONFIG: OrchestratorConfig = {
  autoApprovalEnabled: true,
  autoApprovalThreshold: 0.9,
  maxAutoApprovalsPerDay: 100,
  maxConcurrentExecutions: 10,
  executionTimeoutMs: 60000,
  maxRetries: 3,
  retryDelayMs: 1000,
};

// =============================================================================
// TASK ORCHESTRATOR
// =============================================================================

export class TaskOrchestrator {
  private innerLoop: InnerLoopEngine;
  private escalationManager: EscalationManager;
  private taskRepo: TaskRepository;
  private config: OrchestratorConfig;
  private autoApprovalCounts: Map<string, number> = new Map(); // tenantId -> count

  constructor(config?: Partial<OrchestratorConfig>) {
    this.innerLoop = getInnerLoopEngine();
    this.escalationManager = getEscalationManager();
    this.taskRepo = getTaskRepository();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // MAIN ORCHESTRATION
  // ===========================================================================

  /**
   * Process a task request through the full pipeline
   */
  async processTask(request: TaskRequest, tenantConfig: TenantConfig): Promise<TaskResult> {
    console.log(`[Orchestrator] Processing ${request.type} for tenant ${request.tenantId}`);

    // 1. Determine if this is a sandbox or effectful task
    const isEffectful = isEffectfulTaskType(request.type);

    // 2. Run through inner loop to generate output
    const innerLoopContext = this.buildInnerLoopContext(request);
    const innerLoopResult = await this.innerLoop.execute(innerLoopContext);

    // 3. Check escalation
    const escalationDecision = this.escalationManager.evaluate({
      task: {
        type: request.type,
        payload: innerLoopResult.output?.content as Record<string, unknown>,
      },
      tenantConfig,
      confidenceScore: innerLoopResult.finalScore,
      contentToCheck: JSON.stringify(innerLoopResult.output?.content),
      customContext: request.metadata,
    });

    // 4. Determine next action based on task type and escalation
    let taskId = innerLoopResult.outputTaskId || uuid();
    let status: TaskStatus = 'DRAFT';
    let escalationReason: EscalationReason | undefined;

    if (isEffectful || escalationDecision.shouldEscalate) {
      // Effectful or escalated - needs approval
      status = 'PENDING_APPROVAL';
      escalationReason = escalationDecision.reason;

      // Update task status
      if (innerLoopResult.outputTaskId) {
        await this.taskRepo.queueForApproval(
          innerLoopResult.outputTaskId,
          escalationReason
        );
      }

      // Send notifications
      await this.notifyEscalation(request, escalationDecision, innerLoopResult);

      console.log(`[Orchestrator] Task ${taskId} queued for approval (${escalationReason})`);
    } else if (SANDBOX_TASK_TYPES.includes(request.type)) {
      // Sandbox task - can complete immediately
      status = 'COMPLETED';

      if (innerLoopResult.outputTaskId) {
        await this.taskRepo.markCompleted(
          innerLoopResult.outputTaskId,
          innerLoopResult.output?.content as Record<string, unknown>
        );
      }

      console.log(`[Orchestrator] Sandbox task ${taskId} completed`);
    } else if (this.canAutoApprove(request.tenantId, innerLoopResult, tenantConfig)) {
      // Auto-approve if criteria met
      status = 'APPROVED';

      if (innerLoopResult.outputTaskId) {
        await this.taskRepo.approve(innerLoopResult.outputTaskId, 'SYSTEM_AUTO_APPROVAL');
        this.incrementAutoApprovalCount(request.tenantId);
      }

      // Queue for execution
      await this.queueForExecution(taskId, request.tenantId);

      console.log(`[Orchestrator] Task ${taskId} auto-approved and queued for execution`);
    } else {
      // Default to pending approval
      status = 'PENDING_APPROVAL';

      if (innerLoopResult.outputTaskId) {
        await this.taskRepo.queueForApproval(innerLoopResult.outputTaskId);
      }
    }

    return {
      taskId,
      status,
      output: innerLoopResult.output?.content,
      escalated: escalationDecision.shouldEscalate,
      escalationReason,
      innerLoopResult,
    };
  }

  /**
   * Execute an approved task
   */
  async executeTask(taskId: string): Promise<void> {
    const task = await this.taskRepo.findByIdOrThrow(taskId);

    if (task.status !== 'APPROVED') {
      throw new Error(`Task ${taskId} is not approved (status: ${task.status})`);
    }

    console.log(`[Orchestrator] Executing task ${taskId} (${task.type})`);

    await this.taskRepo.markExecuting(taskId);

    try {
      // Execute based on task type
      const result = await this.executeTaskByType(task);

      await this.taskRepo.markCompleted(taskId, result);
      console.log(`[Orchestrator] Task ${taskId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.taskRepo.markFailed(taskId, errorMessage);
      console.error(`[Orchestrator] Task ${taskId} failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Batch process multiple tasks
   */
  async processBatch(requests: TaskRequest[], tenantConfig: TenantConfig): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    // Process in parallel with concurrency limit
    const chunks = this.chunkArray(requests, this.config.maxConcurrentExecutions);

    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map((req) => this.processTask(req, tenantConfig))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  // ===========================================================================
  // TASK EXECUTION BY TYPE
  // ===========================================================================

  private async executeTaskByType(task: {
    type: TaskType;
    payload: unknown;
    tenantId: string;
  }): Promise<Record<string, unknown>> {
    const payload = task.payload as Record<string, unknown>;

    switch (task.type) {
      case 'SEND_EMAIL':
        return this.executeSendEmail(payload);

      case 'SEND_LINKEDIN_MESSAGE':
        return this.executeSendLinkedIn(payload);

      case 'SCHEDULE_INTERVIEW':
        return this.executeScheduleInterview(payload);

      case 'UPDATE_ATS_STATUS':
        return this.executeUpdateATS(payload);

      case 'SYNC_CANDIDATE':
        return this.executeSyncCandidate(payload);

      default:
        // For tasks without specific executors, just return success
        return { success: true, message: `Task type ${task.type} executed` };
    }
  }

  private async executeSendEmail(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // In production, this would call the email integration
    console.log(`[Executor] Would send email to ${payload.to}`);
    return {
      success: true,
      messageId: uuid(),
      sentAt: new Date().toISOString(),
    };
  }

  private async executeSendLinkedIn(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // In production, this would call the LinkedIn integration
    console.log(`[Executor] Would send LinkedIn message to ${payload.linkedInProfileUrl}`);
    return {
      success: true,
      messageId: uuid(),
      sentAt: new Date().toISOString(),
    };
  }

  private async executeScheduleInterview(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // In production, this would call the calendar integration
    console.log(`[Executor] Would schedule interview for candidate ${payload.candidateId}`);
    return {
      success: true,
      eventId: uuid(),
      scheduledAt: new Date().toISOString(),
    };
  }

  private async executeUpdateATS(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // In production, this would call the ATS integration
    console.log(`[Executor] Would update ATS status for ${payload.externalCandidateId}`);
    return {
      success: true,
      updatedAt: new Date().toISOString(),
    };
  }

  private async executeSyncCandidate(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    // In production, this would sync with the ATS
    console.log(`[Executor] Would sync candidate ${payload.candidateId}`);
    return {
      success: true,
      syncedAt: new Date().toISOString(),
    };
  }

  // ===========================================================================
  // AUTO-APPROVAL LOGIC
  // ===========================================================================

  private canAutoApprove(
    tenantId: string,
    result: InnerLoopResult,
    tenantConfig: TenantConfig
  ): boolean {
    // Check if auto-approval is enabled
    if (!this.config.autoApprovalEnabled) return false;
    if (tenantConfig.autonomy.level === 'conservative') return false;

    // Check confidence threshold
    if (!result.converged) return false;
    if ((result.finalScore || 0) < this.config.autoApprovalThreshold) return false;

    // Check daily limit
    const currentCount = this.autoApprovalCounts.get(tenantId) || 0;
    const maxAllowed = Math.min(
      this.config.maxAutoApprovalsPerDay,
      tenantConfig.autonomy.maxDailyAutoApprovals
    );

    if (currentCount >= maxAllowed) return false;

    // Check auto-approval rules
    const matchingRule = tenantConfig.autonomy.autoApprovalRules.find((rule) => {
      // Check if task type matches
      // In production, would evaluate full conditions
      return true;
    });

    return matchingRule !== undefined || tenantConfig.autonomy.level === 'high';
  }

  private incrementAutoApprovalCount(tenantId: string): void {
    const current = this.autoApprovalCounts.get(tenantId) || 0;
    this.autoApprovalCounts.set(tenantId, current + 1);
  }

  /**
   * Reset auto-approval counts (call daily)
   */
  resetAutoApprovalCounts(): void {
    this.autoApprovalCounts.clear();
  }

  // ===========================================================================
  // QUEUE MANAGEMENT
  // ===========================================================================

  private async queueForExecution(taskId: string, tenantId: string): Promise<void> {
    const queueManager = getQueueManager();
    await queueManager.addJob(QUEUE_NAMES.TASK_EXECUTION, {
      type: 'task-execution',
      tenantId,
      taskId,
    });
  }

  private async notifyEscalation(
    request: TaskRequest,
    escalation: { reason?: EscalationReason; notificationChannels: string[]; message?: string },
    result: InnerLoopResult
  ): Promise<void> {
    const queueManager = getQueueManager();

    for (const channel of escalation.notificationChannels) {
      await queueManager.addJob(QUEUE_NAMES.NOTIFICATIONS, {
        type: 'notification',
        tenantId: request.tenantId,
        channel: channel as 'slack' | 'email' | 'dashboard',
        payload: {
          taskType: request.type,
          escalationReason: escalation.reason,
          message: escalation.message,
          taskId: result.outputTaskId,
          confidenceScore: result.finalScore,
        },
      });
    }
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private buildInnerLoopContext(request: TaskRequest): InnerLoopContext {
    return {
      tenantId: request.tenantId,
      taskType: request.type,
      input: {
        requisitionId: request.input.requisitionId,
        candidateId: request.input.candidateId,
        conversationId: request.input.conversationId,
        data: request.input.data,
        constraints: request.input.constraints,
      },
      guidelinesVersion: 1, // Would be fetched from active guidelines
      criteriaVersion: 1,
      config: {
        maxIterations: 5,
        convergenceThreshold: 0.8,
        learningRate: 0.1,
        timeoutSeconds: 120,
        evaluationDimensions: ['quality', 'relevance', 'compliance'],
        saveIntermediateStates: true,
      },
    };
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: TaskOrchestrator | null = null;

export function getTaskOrchestrator(config?: Partial<OrchestratorConfig>): TaskOrchestrator {
  if (!instance) {
    instance = new TaskOrchestrator(config);
  }
  return instance;
}

export function resetTaskOrchestrator(): void {
  instance = null;
}
