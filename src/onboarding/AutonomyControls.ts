/**
 * Graduated Autonomy Controls
 *
 * Manages Riley's autonomy level per tenant based on:
 * - Performance metrics
 * - Teleoperator feedback
 * - Time in operation
 * - Error rates
 *
 * Autonomy progression:
 * 1. ONBOARDING - Setup phase, no autonomy
 * 2. SHADOW_MODE - Observe only, no actions
 * 3. SUPERVISED - 100% approval required
 * 4. AUTONOMOUS - Escalation-only oversight
 * 5. PAUSED - Temporarily disabled
 */

import { v4 as uuid } from 'uuid';
import { PrismaClient, TenantStatus } from '../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AutonomyConfig {
  // Thresholds for promotion
  promotionThresholds: PromotionThresholds;
  // Thresholds for demotion
  demotionThresholds: DemotionThresholds;
  // Minimum time in each level
  minimumDuration: Record<TenantStatus, number>; // hours
  // Actions that always require approval
  alwaysEscalate: EscalationRule[];
}

export interface PromotionThresholds {
  shadowToSupervised: {
    minDaysInShadow: number;
    minInteractions: number;
    minMatchRate: number; // Riley vs human match rate
  };
  supervisedToAutonomous: {
    minDaysSupervised: number;
    minApprovals: number;
    approvalRate: number; // % approved by teleoperators
    errorRate: number; // Max error rate
    responseRate: number; // Min candidate response rate
  };
}

export interface DemotionThresholds {
  errorRateMax: number;
  rejectionRateMax: number;
  complaintsMax: number; // per week
  responseRateMin: number;
}

export interface EscalationRule {
  name: string;
  description: string;
  condition: EscalationCondition;
  action: 'require_approval' | 'notify' | 'block';
  overrideLevel?: TenantStatus; // Can be overridden at this level
}

export type EscalationCondition =
  | { type: 'keyword'; keywords: string[] }
  | { type: 'candidate_type'; types: string[] }
  | { type: 'task_type'; tasks: string[] }
  | { type: 'value_threshold'; field: string; max: number }
  | { type: 'first_contact'; requireApproval: boolean }
  | { type: 'custom'; evaluator: string };

export interface AutonomyLevel {
  status: TenantStatus;
  approvalRequired: ApprovalRequirements;
  allowedActions: string[];
  blockedActions: string[];
  escalationOverrides: string[];
}

export interface ApprovalRequirements {
  allTasks: boolean;
  effectfulTasks: boolean;
  firstContact: boolean;
  sensitiveTopics: boolean;
  highValueCandidates: boolean;
}

export interface AutonomyMetrics {
  tenantId: string;
  period: 'day' | 'week' | 'month';
  startDate: Date;
  endDate: Date;
  metrics: {
    totalTasks: number;
    approvedTasks: number;
    rejectedTasks: number;
    autoApprovedTasks: number;
    escalatedTasks: number;
    errorCount: number;
    responseRate: number;
    complaints: number;
    averageApprovalTime: number; // minutes
  };
  calculatedScores: {
    approvalRate: number;
    errorRate: number;
    escalationRate: number;
    efficiency: number;
  };
}

export interface AutonomyTransition {
  id: string;
  tenantId: string;
  fromLevel: TenantStatus;
  toLevel: TenantStatus;
  reason: string;
  initiatedBy: 'system' | 'teleoperator';
  metrics?: AutonomyMetrics;
  approvedBy?: string;
  timestamp: Date;
}

// Default configuration
const DEFAULT_CONFIG: AutonomyConfig = {
  promotionThresholds: {
    shadowToSupervised: {
      minDaysInShadow: 7,
      minInteractions: 100,
      minMatchRate: 0.7,
    },
    supervisedToAutonomous: {
      minDaysSupervised: 14,
      minApprovals: 200,
      approvalRate: 0.9,
      errorRate: 0.05,
      responseRate: 0.1,
    },
  },
  demotionThresholds: {
    errorRateMax: 0.15,
    rejectionRateMax: 0.3,
    complaintsMax: 3,
    responseRateMin: 0.05,
  },
  minimumDuration: {
    ONBOARDING: 1,
    SHADOW_MODE: 168, // 7 days
    SUPERVISED: 336, // 14 days
    AUTONOMOUS: 0, // No minimum
    PAUSED: 0,
  },
  alwaysEscalate: [
    {
      name: 'Compensation Discussion',
      description: 'Any discussion of salary, equity, or benefits',
      condition: {
        type: 'keyword',
        keywords: ['salary', 'compensation', 'equity', 'benefits', 'bonus', 'offer'],
      },
      action: 'require_approval',
    },
    {
      name: 'Offer Extension',
      description: 'Sending job offers to candidates',
      condition: { type: 'task_type', tasks: ['SEND_OFFER', 'PREPARE_OFFER'] },
      action: 'require_approval',
    },
    {
      name: 'VIP Candidate',
      description: 'First contact with executive-level candidates',
      condition: { type: 'candidate_type', types: ['executive', 'vip', 'referral'] },
      action: 'require_approval',
    },
    {
      name: 'High Value Role',
      description: 'Roles with salary above threshold',
      condition: { type: 'value_threshold', field: 'salary_max', max: 200000 },
      action: 'require_approval',
    },
  ],
};

// Autonomy levels configuration
const AUTONOMY_LEVELS: Record<TenantStatus, AutonomyLevel> = {
  ONBOARDING: {
    status: 'ONBOARDING',
    approvalRequired: {
      allTasks: true,
      effectfulTasks: true,
      firstContact: true,
      sensitiveTopics: true,
      highValueCandidates: true,
    },
    allowedActions: ['read', 'analyze', 'draft'],
    blockedActions: ['send', 'schedule', 'update_ats', 'delete'],
    escalationOverrides: [],
  },
  SHADOW_MODE: {
    status: 'SHADOW_MODE',
    approvalRequired: {
      allTasks: true,
      effectfulTasks: true,
      firstContact: true,
      sensitiveTopics: true,
      highValueCandidates: true,
    },
    allowedActions: ['read', 'analyze', 'draft', 'compare'],
    blockedActions: ['send', 'schedule', 'update_ats', 'delete'],
    escalationOverrides: [],
  },
  SUPERVISED: {
    status: 'SUPERVISED',
    approvalRequired: {
      allTasks: false,
      effectfulTasks: true,
      firstContact: true,
      sensitiveTopics: true,
      highValueCandidates: true,
    },
    allowedActions: ['read', 'analyze', 'draft', 'send', 'schedule'],
    blockedActions: ['delete', 'bulk_update'],
    escalationOverrides: [],
  },
  AUTONOMOUS: {
    status: 'AUTONOMOUS',
    approvalRequired: {
      allTasks: false,
      effectfulTasks: false,
      firstContact: false,
      sensitiveTopics: true,
      highValueCandidates: true,
    },
    allowedActions: ['read', 'analyze', 'draft', 'send', 'schedule', 'update_ats'],
    blockedActions: ['delete'],
    escalationOverrides: ['routine_followup', 'standard_screening'],
  },
  PAUSED: {
    status: 'PAUSED',
    approvalRequired: {
      allTasks: true,
      effectfulTasks: true,
      firstContact: true,
      sensitiveTopics: true,
      highValueCandidates: true,
    },
    allowedActions: ['read'],
    blockedActions: ['analyze', 'draft', 'send', 'schedule', 'update_ats', 'delete'],
    escalationOverrides: [],
  },
};

// =============================================================================
// AUTONOMY CONTROLLER
// =============================================================================

export class AutonomyController {
  private config: AutonomyConfig;
  private prisma: PrismaClient;
  private transitionHistory: AutonomyTransition[] = [];

  constructor(config: Partial<AutonomyConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.prisma = new PrismaClient();
  }

  // ===========================================================================
  // LEVEL MANAGEMENT
  // ===========================================================================

  /**
   * Get current autonomy level for a tenant
   */
  async getAutonomyLevel(tenantId: string): Promise<AutonomyLevel> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    return AUTONOMY_LEVELS[tenant.status as TenantStatus];
  }

  /**
   * Check if an action requires approval at current level
   */
  async requiresApproval(
    tenantId: string,
    action: string,
    context: ActionContext
  ): Promise<{ required: boolean; reason?: string }> {
    const level = await this.getAutonomyLevel(tenantId);

    // Check if action is blocked
    if (level.blockedActions.includes(action)) {
      return { required: true, reason: `Action '${action}' is blocked at ${level.status} level` };
    }

    // Check approval requirements
    if (level.approvalRequired.allTasks) {
      return { required: true, reason: 'All tasks require approval at current level' };
    }

    if (context.isEffectful && level.approvalRequired.effectfulTasks) {
      return { required: true, reason: 'Effectful tasks require approval' };
    }

    if (context.isFirstContact && level.approvalRequired.firstContact) {
      return { required: true, reason: 'First contact requires approval' };
    }

    if (context.isSensitive && level.approvalRequired.sensitiveTopics) {
      return { required: true, reason: 'Sensitive topic requires approval' };
    }

    if (context.isHighValue && level.approvalRequired.highValueCandidates) {
      return { required: true, reason: 'High value candidate requires approval' };
    }

    // Check always-escalate rules
    for (const rule of this.config.alwaysEscalate) {
      if (this.matchesEscalationRule(rule, context)) {
        if (rule.overrideLevel && this.isAtOrAboveLevel(level.status, rule.overrideLevel)) {
          continue; // Rule can be overridden at this level
        }
        return { required: true, reason: rule.description };
      }
    }

    return { required: false };
  }

  // ===========================================================================
  // LEVEL TRANSITIONS
  // ===========================================================================

  /**
   * Evaluate if tenant should be promoted to next level
   */
  async evaluatePromotion(tenantId: string): Promise<{
    eligible: boolean;
    currentLevel: TenantStatus;
    nextLevel?: TenantStatus;
    blockers?: string[];
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const currentLevel = tenant.status as TenantStatus;
    const blockers: string[] = [];

    // Check minimum time in current level
    const hoursInLevel = this.getHoursInLevel(tenant.updatedAt);
    const minHours = this.config.minimumDuration[currentLevel];
    if (hoursInLevel < minHours) {
      blockers.push(
        `Minimum time not met: ${hoursInLevel.toFixed(0)}h / ${minHours}h required`
      );
    }

    // Evaluate based on current level
    switch (currentLevel) {
      case 'ONBOARDING':
        // Can always move to shadow mode
        return {
          eligible: blockers.length === 0,
          currentLevel,
          nextLevel: 'SHADOW_MODE',
          blockers,
        };

      case 'SHADOW_MODE': {
        const shadowMetrics = await this.getShadowMetrics(tenantId);
        const thresholds = this.config.promotionThresholds.shadowToSupervised;

        if (shadowMetrics.interactions < thresholds.minInteractions) {
          blockers.push(
            `Interactions: ${shadowMetrics.interactions} / ${thresholds.minInteractions} required`
          );
        }
        if (shadowMetrics.matchRate < thresholds.minMatchRate) {
          blockers.push(
            `Match rate: ${(shadowMetrics.matchRate * 100).toFixed(1)}% / ${thresholds.minMatchRate * 100}% required`
          );
        }

        return {
          eligible: blockers.length === 0,
          currentLevel,
          nextLevel: 'SUPERVISED',
          blockers,
        };
      }

      case 'SUPERVISED': {
        const metrics = await this.calculateMetrics(tenantId, 'week');
        const thresholds = this.config.promotionThresholds.supervisedToAutonomous;

        if (metrics.calculatedScores.approvalRate < thresholds.approvalRate) {
          blockers.push(
            `Approval rate: ${(metrics.calculatedScores.approvalRate * 100).toFixed(1)}% / ${thresholds.approvalRate * 100}% required`
          );
        }
        if (metrics.calculatedScores.errorRate > thresholds.errorRate) {
          blockers.push(
            `Error rate: ${(metrics.calculatedScores.errorRate * 100).toFixed(1)}% / ${thresholds.errorRate * 100}% max`
          );
        }
        if (metrics.metrics.responseRate < thresholds.responseRate) {
          blockers.push(
            `Response rate: ${(metrics.metrics.responseRate * 100).toFixed(1)}% / ${thresholds.responseRate * 100}% required`
          );
        }
        if (metrics.metrics.approvedTasks < thresholds.minApprovals) {
          blockers.push(
            `Approved tasks: ${metrics.metrics.approvedTasks} / ${thresholds.minApprovals} required`
          );
        }

        return {
          eligible: blockers.length === 0,
          currentLevel,
          nextLevel: 'AUTONOMOUS',
          blockers,
        };
      }

      case 'AUTONOMOUS':
        return {
          eligible: false,
          currentLevel,
          blockers: ['Already at maximum autonomy level'],
        };

      case 'PAUSED':
        return {
          eligible: false,
          currentLevel,
          blockers: ['Tenant is paused - must be resumed first'],
        };

      default:
        return {
          eligible: false,
          currentLevel,
          blockers: ['Unknown status'],
        };
    }
  }

  /**
   * Evaluate if tenant should be demoted
   */
  async evaluateDemotion(tenantId: string): Promise<{
    shouldDemote: boolean;
    currentLevel: TenantStatus;
    suggestedLevel?: TenantStatus;
    reasons?: string[];
  }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    const currentLevel = tenant.status as TenantStatus;

    // Can't demote below SUPERVISED (shadow mode is a special state)
    if (currentLevel === 'ONBOARDING' || currentLevel === 'SHADOW_MODE') {
      return { shouldDemote: false, currentLevel };
    }

    const metrics = await this.calculateMetrics(tenantId, 'week');
    const thresholds = this.config.demotionThresholds;
    const reasons: string[] = [];

    if (metrics.calculatedScores.errorRate > thresholds.errorRateMax) {
      reasons.push(
        `Error rate too high: ${(metrics.calculatedScores.errorRate * 100).toFixed(1)}%`
      );
    }

    const rejectionRate =
      metrics.metrics.rejectedTasks /
      (metrics.metrics.approvedTasks + metrics.metrics.rejectedTasks || 1);
    if (rejectionRate > thresholds.rejectionRateMax) {
      reasons.push(`Rejection rate too high: ${(rejectionRate * 100).toFixed(1)}%`);
    }

    if (metrics.metrics.complaints > thresholds.complaintsMax) {
      reasons.push(`Too many complaints: ${metrics.metrics.complaints}`);
    }

    if (metrics.metrics.responseRate < thresholds.responseRateMin) {
      reasons.push(
        `Response rate too low: ${(metrics.metrics.responseRate * 100).toFixed(1)}%`
      );
    }

    if (reasons.length > 0) {
      const suggestedLevel: TenantStatus =
        currentLevel === 'AUTONOMOUS' ? 'SUPERVISED' : 'SHADOW_MODE';
      return {
        shouldDemote: true,
        currentLevel,
        suggestedLevel,
        reasons,
      };
    }

    return { shouldDemote: false, currentLevel };
  }

  /**
   * Promote tenant to next autonomy level
   */
  async promoteTenant(
    tenantId: string,
    approvedBy?: string
  ): Promise<AutonomyTransition> {
    const evaluation = await this.evaluatePromotion(tenantId);

    if (!evaluation.eligible || !evaluation.nextLevel) {
      throw new Error(`Tenant not eligible for promotion: ${evaluation.blockers?.join(', ')}`);
    }

    return this.transitionTenant(
      tenantId,
      evaluation.currentLevel,
      evaluation.nextLevel,
      'Promotion based on performance metrics',
      approvedBy ? 'teleoperator' : 'system',
      approvedBy
    );
  }

  /**
   * Demote tenant to lower autonomy level
   */
  async demoteTenant(
    tenantId: string,
    reason: string,
    initiatedBy: 'system' | 'teleoperator',
    approvedBy?: string
  ): Promise<AutonomyTransition> {
    const evaluation = await this.evaluateDemotion(tenantId);

    if (!evaluation.suggestedLevel) {
      throw new Error('Cannot determine demotion target level');
    }

    return this.transitionTenant(
      tenantId,
      evaluation.currentLevel,
      evaluation.suggestedLevel,
      reason,
      initiatedBy,
      approvedBy
    );
  }

  /**
   * Pause a tenant (emergency stop)
   */
  async pauseTenant(
    tenantId: string,
    reason: string,
    initiatedBy: 'system' | 'teleoperator'
  ): Promise<AutonomyTransition> {
    const level = await this.getAutonomyLevel(tenantId);

    return this.transitionTenant(
      tenantId,
      level.status,
      'PAUSED',
      reason,
      initiatedBy
    );
  }

  /**
   * Resume a paused tenant
   */
  async resumeTenant(
    tenantId: string,
    resumeToLevel: TenantStatus,
    approvedBy: string
  ): Promise<AutonomyTransition> {
    const level = await this.getAutonomyLevel(tenantId);

    if (level.status !== 'PAUSED') {
      throw new Error('Tenant is not paused');
    }

    return this.transitionTenant(
      tenantId,
      'PAUSED',
      resumeToLevel,
      `Resumed by ${approvedBy}`,
      'teleoperator',
      approvedBy
    );
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async transitionTenant(
    tenantId: string,
    fromLevel: TenantStatus,
    toLevel: TenantStatus,
    reason: string,
    initiatedBy: 'system' | 'teleoperator',
    approvedBy?: string
  ): Promise<AutonomyTransition> {
    // Update tenant status
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: toLevel },
    });

    // Record transition
    const transition: AutonomyTransition = {
      id: uuid(),
      tenantId,
      fromLevel,
      toLevel,
      reason,
      initiatedBy,
      approvedBy,
      timestamp: new Date(),
    };

    this.transitionHistory.push(transition);

    console.log(
      `[Autonomy] Tenant ${tenantId} transitioned: ${fromLevel} -> ${toLevel} (${reason})`
    );

    return transition;
  }

  private matchesEscalationRule(rule: EscalationRule, context: ActionContext): boolean {
    const condition = rule.condition;

    switch (condition.type) {
      case 'keyword':
        return condition.keywords.some((kw) =>
          context.content?.toLowerCase().includes(kw.toLowerCase())
        );
      case 'candidate_type':
        return condition.types.includes(context.candidateType || '');
      case 'task_type':
        return condition.tasks.includes(context.taskType || '');
      case 'value_threshold':
        return (context.value || 0) > condition.max;
      case 'first_contact':
        return context.isFirstContact === condition.requireApproval;
      case 'custom':
        return false; // Would need custom evaluator implementation
      default:
        return false;
    }
  }

  private isAtOrAboveLevel(current: TenantStatus, required: TenantStatus): boolean {
    const order: TenantStatus[] = [
      'ONBOARDING',
      'SHADOW_MODE',
      'SUPERVISED',
      'AUTONOMOUS',
    ];
    return order.indexOf(current) >= order.indexOf(required);
  }

  private getHoursInLevel(updatedAt: Date): number {
    return (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60);
  }

  private async getShadowMetrics(
    _tenantId: string
  ): Promise<{ interactions: number; matchRate: number }> {
    // In production, query shadow mode session data
    return { interactions: 0, matchRate: 0 };
  }

  async calculateMetrics(
    tenantId: string,
    period: 'day' | 'week' | 'month'
  ): Promise<AutonomyMetrics> {
    const now = new Date();
    const startDate = new Date(now);

    switch (period) {
      case 'day':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    // In production, query actual task data
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId,
        createdAt: { gte: startDate },
      },
    });

    const total = tasks.length;
    const approved = tasks.filter((t: { status: string }) => t.status === 'COMPLETED').length;
    const rejected = tasks.filter((t: { status: string }) => t.status === 'REJECTED').length;
    const failed = tasks.filter((t: { status: string }) => t.status === 'FAILED').length;
    const escalated = tasks.filter((t: { escalationReason: string | null }) => t.escalationReason).length;

    return {
      tenantId,
      period,
      startDate,
      endDate: now,
      metrics: {
        totalTasks: total,
        approvedTasks: approved,
        rejectedTasks: rejected,
        autoApprovedTasks: 0,
        escalatedTasks: escalated,
        errorCount: failed,
        responseRate: 0.12, // Would calculate from conversation data
        complaints: 0,
        averageApprovalTime: 30,
      },
      calculatedScores: {
        approvalRate: total > 0 ? approved / total : 0,
        errorRate: total > 0 ? failed / total : 0,
        escalationRate: total > 0 ? escalated / total : 0,
        efficiency: 0.8,
      },
    };
  }

  /**
   * Get transition history for a tenant
   */
  getTransitionHistory(tenantId: string): AutonomyTransition[] {
    return this.transitionHistory.filter((t) => t.tenantId === tenantId);
  }
}

// =============================================================================
// CONTEXT TYPE
// =============================================================================

export interface ActionContext {
  taskType?: string;
  content?: string;
  candidateType?: string;
  value?: number;
  isEffectful: boolean;
  isFirstContact: boolean;
  isSensitive: boolean;
  isHighValue: boolean;
}

// =============================================================================
// SINGLETON
// =============================================================================

let controllerInstance: AutonomyController | null = null;

export function getAutonomyController(
  config?: Partial<AutonomyConfig>
): AutonomyController {
  if (!controllerInstance) {
    controllerInstance = new AutonomyController(config);
  }
  return controllerInstance;
}
