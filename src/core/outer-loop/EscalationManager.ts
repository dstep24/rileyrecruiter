/**
 * Escalation Manager - When to Involve Human Teleoperators
 *
 * The bridge between the inner loop (autonomous agent) and
 * outer loop (human teleoperators). Determines when Riley
 * should escalate to human oversight.
 *
 * Key Two-Loop Principles:
 * - High autonomy: Agent acts on most tasks
 * - Escalate for: sensitive comms, edge cases, offers, low confidence
 * - Never escalate Criteria changes (only teleoperators can modify C)
 */

import type { Task, TaskType, EscalationReason as EscalationReasonType, Priority } from '../../generated/prisma/index.js';
import type { TenantConfig, AutonomyConfig } from '../../domain/entities/Tenant.js';

// =============================================================================
// TYPES
// =============================================================================

export interface EscalationTrigger {
  id: string;
  name: string;
  description: string;
  condition: EscalationCondition;
  reason: EscalationReasonType;
  priority: Priority;
  notificationChannels: NotificationChannel[];
  enabled: boolean;
}

export type EscalationCondition =
  | TaskTypeCondition
  | ContentCondition
  | ConfidenceCondition
  | CandidateFlagCondition
  | ConversationIntentCondition
  | CustomCondition;

export interface TaskTypeCondition {
  type: 'task_type';
  taskTypes: TaskType[];
}

export interface ContentCondition {
  type: 'content';
  patterns: string[];
  caseSensitive: boolean;
}

export interface ConfidenceCondition {
  type: 'confidence';
  threshold: number;
  comparison: 'below' | 'above';
}

export interface CandidateFlagCondition {
  type: 'candidate_flag';
  flags: string[];
}

export interface ConversationIntentCondition {
  type: 'conversation_intent';
  intents: string[];
}

export interface CustomCondition {
  type: 'custom';
  evaluator: string; // Name of custom evaluator function
  config: Record<string, unknown>;
}

export type NotificationChannel = 'dashboard' | 'slack' | 'email' | 'teams';

export interface EscalationDecision {
  shouldEscalate: boolean;
  reason?: EscalationReasonType;
  priority?: Priority;
  triggers: string[]; // IDs of triggered rules
  notificationChannels: NotificationChannel[];
  message?: string;
}

export interface EscalationContext {
  task: Partial<Task>;
  tenantConfig: TenantConfig;
  candidateFlags?: string[];
  conversationIntent?: string;
  confidenceScore?: number;
  contentToCheck?: string;
  customContext?: Record<string, unknown>;
}

// =============================================================================
// DEFAULT ESCALATION TRIGGERS
// =============================================================================

const DEFAULT_TRIGGERS: EscalationTrigger[] = [
  // Always escalate offers
  {
    id: 'offer-tasks',
    name: 'Offer Tasks',
    description: 'All offer-related tasks require approval',
    condition: {
      type: 'task_type',
      taskTypes: ['PREPARE_OFFER', 'SEND_OFFER'],
    },
    reason: 'OFFER_NEGOTIATION',
    priority: 'HIGH',
    notificationChannels: ['dashboard', 'slack'],
    enabled: true,
  },

  // Escalate low confidence outputs
  {
    id: 'low-confidence',
    name: 'Low Confidence',
    description: 'Output confidence below threshold',
    condition: {
      type: 'confidence',
      threshold: 0.7,
      comparison: 'below',
    },
    reason: 'LOW_CONFIDENCE',
    priority: 'MEDIUM',
    notificationChannels: ['dashboard'],
    enabled: true,
  },

  // Escalate budget/salary discussions
  {
    id: 'budget-discussion',
    name: 'Budget Discussion',
    description: 'Messages mentioning salary or compensation',
    condition: {
      type: 'content',
      patterns: ['salary', 'compensation', 'pay', 'budget', 'offer', '\\$\\d+'],
      caseSensitive: false,
    },
    reason: 'BUDGET_DISCUSSION',
    priority: 'HIGH',
    notificationChannels: ['dashboard', 'slack'],
    enabled: true,
  },

  // Escalate VIP candidates
  {
    id: 'vip-candidate',
    name: 'VIP Candidate',
    description: 'First contact with VIP flagged candidates',
    condition: {
      type: 'candidate_flag',
      flags: ['vip', 'executive', 'referral'],
    },
    reason: 'FIRST_CONTACT_VIP',
    priority: 'HIGH',
    notificationChannels: ['dashboard', 'slack'],
    enabled: true,
  },

  // Escalate complaints
  {
    id: 'candidate-complaint',
    name: 'Candidate Complaint',
    description: 'Conversation detected as complaint',
    condition: {
      type: 'conversation_intent',
      intents: ['complaint', 'negative'],
    },
    reason: 'CANDIDATE_COMPLAINT',
    priority: 'URGENT',
    notificationChannels: ['dashboard', 'slack', 'email'],
    enabled: true,
  },

  // Escalate sensitive content
  {
    id: 'sensitive-content',
    name: 'Sensitive Content',
    description: 'Messages with potentially sensitive content',
    condition: {
      type: 'content',
      patterns: ['termination', 'lawsuit', 'legal', 'harassment', 'discrimination'],
      caseSensitive: false,
    },
    reason: 'SENSITIVE_COMMUNICATION',
    priority: 'URGENT',
    notificationChannels: ['dashboard', 'slack', 'email'],
    enabled: true,
  },
];

// =============================================================================
// ESCALATION MANAGER
// =============================================================================

export class EscalationManager {
  private triggers: EscalationTrigger[];
  private customEvaluators: Map<string, CustomEvaluatorFn>;

  constructor(customTriggers?: EscalationTrigger[]) {
    this.triggers = customTriggers || DEFAULT_TRIGGERS;
    this.customEvaluators = new Map();

    // Register default custom evaluators
    this.registerCustomEvaluator('always', () => true);
    this.registerCustomEvaluator('never', () => false);
  }

  /**
   * Evaluate if a task should be escalated
   */
  evaluate(context: EscalationContext): EscalationDecision {
    const triggeredRules: EscalationTrigger[] = [];

    // Check tenant autonomy level first
    const autonomyOverride = this.checkAutonomyOverride(context);
    if (autonomyOverride.shouldEscalate) {
      return autonomyOverride;
    }

    // Check each enabled trigger
    for (const trigger of this.triggers) {
      if (!trigger.enabled) continue;

      if (this.evaluateCondition(trigger.condition, context)) {
        triggeredRules.push(trigger);
      }
    }

    if (triggeredRules.length === 0) {
      return {
        shouldEscalate: false,
        triggers: [],
        notificationChannels: [],
      };
    }

    // Determine highest priority and aggregate channels
    const highestPriority = this.getHighestPriority(triggeredRules);
    const allChannels = this.aggregateChannels(triggeredRules);
    const primaryReason = triggeredRules[0].reason;

    return {
      shouldEscalate: true,
      reason: primaryReason,
      priority: highestPriority,
      triggers: triggeredRules.map((t) => t.id),
      notificationChannels: allChannels,
      message: this.buildEscalationMessage(triggeredRules),
    };
  }

  /**
   * Check if autonomy config forces escalation
   */
  private checkAutonomyOverride(context: EscalationContext): EscalationDecision {
    const autonomy = context.tenantConfig.autonomy;

    // Conservative mode: escalate everything
    if (autonomy.level === 'conservative') {
      return {
        shouldEscalate: true,
        reason: 'MANUAL_REVIEW_REQUESTED',
        priority: 'MEDIUM',
        triggers: ['autonomy-conservative'],
        notificationChannels: ['dashboard'],
        message: 'Conservative autonomy level requires all tasks to be reviewed',
      };
    }

    // Check action-specific overrides
    const taskType = context.task.type;
    if (taskType) {
      const override = autonomy.actionOverrides.find((o) => o.taskType === taskType);
      if (override?.requiresApproval) {
        return {
          shouldEscalate: true,
          reason: 'MANUAL_REVIEW_REQUESTED',
          priority: 'MEDIUM',
          triggers: [`override-${taskType}`],
          notificationChannels: ['dashboard'],
          message: `Task type ${taskType} requires approval per tenant config`,
        };
      }
    }

    return {
      shouldEscalate: false,
      triggers: [],
      notificationChannels: [],
    };
  }

  /**
   * Evaluate a single condition
   */
  private evaluateCondition(condition: EscalationCondition, context: EscalationContext): boolean {
    switch (condition.type) {
      case 'task_type':
        return this.evaluateTaskType(condition, context);

      case 'content':
        return this.evaluateContent(condition, context);

      case 'confidence':
        return this.evaluateConfidence(condition, context);

      case 'candidate_flag':
        return this.evaluateCandidateFlag(condition, context);

      case 'conversation_intent':
        return this.evaluateConversationIntent(condition, context);

      case 'custom':
        return this.evaluateCustom(condition, context);

      default:
        return false;
    }
  }

  private evaluateTaskType(condition: TaskTypeCondition, context: EscalationContext): boolean {
    return context.task.type !== undefined && condition.taskTypes.includes(context.task.type);
  }

  private evaluateContent(condition: ContentCondition, context: EscalationContext): boolean {
    if (!context.contentToCheck) return false;

    const content = condition.caseSensitive
      ? context.contentToCheck
      : context.contentToCheck.toLowerCase();

    for (const pattern of condition.patterns) {
      const regex = new RegExp(pattern, condition.caseSensitive ? '' : 'i');
      if (regex.test(content)) {
        return true;
      }
    }

    return false;
  }

  private evaluateConfidence(condition: ConfidenceCondition, context: EscalationContext): boolean {
    if (context.confidenceScore === undefined) return false;

    if (condition.comparison === 'below') {
      return context.confidenceScore < condition.threshold;
    } else {
      return context.confidenceScore > condition.threshold;
    }
  }

  private evaluateCandidateFlag(condition: CandidateFlagCondition, context: EscalationContext): boolean {
    if (!context.candidateFlags || context.candidateFlags.length === 0) return false;

    return condition.flags.some((flag) => context.candidateFlags!.includes(flag));
  }

  private evaluateConversationIntent(
    condition: ConversationIntentCondition,
    context: EscalationContext
  ): boolean {
    if (!context.conversationIntent) return false;

    return condition.intents.includes(context.conversationIntent);
  }

  private evaluateCustom(condition: CustomCondition, context: EscalationContext): boolean {
    const evaluator = this.customEvaluators.get(condition.evaluator);
    if (!evaluator) {
      console.warn(`Custom evaluator not found: ${condition.evaluator}`);
      return false;
    }

    return evaluator(context, condition.config);
  }

  // ===========================================================================
  // TRIGGER MANAGEMENT
  // ===========================================================================

  /**
   * Add a custom trigger
   */
  addTrigger(trigger: EscalationTrigger): void {
    // Remove existing trigger with same ID
    this.triggers = this.triggers.filter((t) => t.id !== trigger.id);
    this.triggers.push(trigger);
  }

  /**
   * Remove a trigger
   */
  removeTrigger(triggerId: string): void {
    this.triggers = this.triggers.filter((t) => t.id !== triggerId);
  }

  /**
   * Enable/disable a trigger
   */
  setTriggerEnabled(triggerId: string, enabled: boolean): void {
    const trigger = this.triggers.find((t) => t.id === triggerId);
    if (trigger) {
      trigger.enabled = enabled;
    }
  }

  /**
   * Get all triggers
   */
  getTriggers(): EscalationTrigger[] {
    return [...this.triggers];
  }

  /**
   * Register a custom evaluator function
   */
  registerCustomEvaluator(name: string, evaluator: CustomEvaluatorFn): void {
    this.customEvaluators.set(name, evaluator);
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private getHighestPriority(triggers: EscalationTrigger[]): Priority {
    const priorityOrder: Priority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

    for (const priority of priorityOrder) {
      if (triggers.some((t) => t.priority === priority)) {
        return priority;
      }
    }

    return 'MEDIUM';
  }

  private aggregateChannels(triggers: EscalationTrigger[]): NotificationChannel[] {
    const channels = new Set<NotificationChannel>();

    for (const trigger of triggers) {
      for (const channel of trigger.notificationChannels) {
        channels.add(channel);
      }
    }

    return Array.from(channels);
  }

  private buildEscalationMessage(triggers: EscalationTrigger[]): string {
    const reasons = triggers.map((t) => t.name);
    return `Escalation required: ${reasons.join(', ')}`;
  }
}

// =============================================================================
// TYPES
// =============================================================================

type CustomEvaluatorFn = (
  context: EscalationContext,
  config: Record<string, unknown>
) => boolean;

// =============================================================================
// SINGLETON
// =============================================================================

let instance: EscalationManager | null = null;

export function getEscalationManager(): EscalationManager {
  if (!instance) {
    instance = new EscalationManager();
  }
  return instance;
}

export function resetEscalationManager(): void {
  instance = null;
}
