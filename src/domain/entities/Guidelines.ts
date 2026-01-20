/**
 * Guidelines (G) - "How to Recruit"
 *
 * Encodes the generative framework for recruiting tasks.
 * Agent CAN update these autonomously in the inner loop.
 *
 * Key principle: Learn-Regenerate, not Edit-Revise
 * When output fails to meet criteria, generate NEW guidelines
 * rather than patching existing ones.
 */

// =============================================================================
// WORKFLOW GUIDELINES
// =============================================================================

export interface WorkflowGuideline {
  id: string;
  name: string;
  description: string;
  domain: WorkflowDomain;
  stages: WorkflowStage[];
  triggers: WorkflowTrigger[];
  escalationRules: EscalationRule[];
  constraints: WorkflowConstraint[];
  metadata: {
    version: number;
    createdAt: string;
    lastUsed?: string;
    successRate?: number;
  };
}

export type WorkflowDomain = 'sourcing' | 'outreach' | 'screening' | 'scheduling' | 'offer';

export interface WorkflowStage {
  id: string;
  name: string;
  order: number;
  actions: WorkflowAction[];
  entryConditions: Condition[];
  exitConditions: Condition[];
  timeoutMinutes?: number;
  fallbackStageId?: string;
}

export interface WorkflowAction {
  id: string;
  type: ActionType;
  config: Record<string, unknown>;
  retryPolicy?: RetryPolicy;
}

export type ActionType =
  | 'send_message'
  | 'wait_for_response'
  | 'evaluate_candidate'
  | 'schedule_meeting'
  | 'update_pipeline_stage'
  | 'notify_teleoperator'
  | 'call_integration'
  | 'run_inner_loop';

export interface RetryPolicy {
  maxRetries: number;
  backoffMinutes: number;
  backoffMultiplier: number;
}

export interface Condition {
  field: string;
  operator: ConditionOperator;
  value: unknown;
  logicalOp?: 'AND' | 'OR';
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'in'
  | 'not_in'
  | 'exists'
  | 'not_exists';

export interface WorkflowTrigger {
  id: string;
  event: TriggerEvent;
  conditions: Condition[];
  priority: number;
}

export type TriggerEvent =
  | 'candidate_created'
  | 'candidate_responded'
  | 'interview_completed'
  | 'time_elapsed'
  | 'stage_changed'
  | 'score_threshold_met'
  | 'manual_trigger';

export interface EscalationRule {
  id: string;
  name: string;
  conditions: Condition[];
  reason: EscalationReasonType;
  priority: 'low' | 'medium' | 'high' | 'critical';
  notificationChannels: NotificationChannel[];
}

export type EscalationReasonType =
  | 'sensitive_communication'
  | 'budget_discussion'
  | 'offer_negotiation'
  | 'candidate_complaint'
  | 'edge_case'
  | 'low_confidence'
  | 'policy_violation_risk'
  | 'first_contact_vip'
  | 'manual_review_requested';

export type NotificationChannel = 'dashboard' | 'slack' | 'email' | 'teams';

export interface WorkflowConstraint {
  id: string;
  type: ConstraintType;
  config: Record<string, unknown>;
  violationAction: 'block' | 'warn' | 'escalate';
}

export type ConstraintType =
  | 'rate_limit' // Max messages per day
  | 'time_window' // Only operate during business hours
  | 'approval_required' // Certain actions need approval
  | 'content_filter' // Block certain content
  | 'compliance'; // Legal/regulatory constraints

// =============================================================================
// TEMPLATE GUIDELINES
// =============================================================================

export interface TemplateGuideline {
  id: string;
  name: string;
  type: TemplateType;
  purpose: TemplatePurpose;
  channel: TemplateChannel;

  // The template content with variable placeholders
  subject?: string; // For emails
  body: string;
  variables: TemplateVariable[];

  // Brand voice configuration
  brandVoice: BrandVoiceConfig;

  // When to use this template
  usageConditions: Condition[];

  // Performance tracking
  metadata: {
    version: number;
    usageCount: number;
    responseRate?: number;
    avgResponseTime?: number;
  };
}

export type TemplateType = 'email' | 'linkedin_message' | 'sms' | 'calendar_invite' | 'slack';

export type TemplatePurpose =
  | 'initial_outreach'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'follow_up_final'
  | 'interview_invitation'
  | 'interview_confirmation'
  | 'interview_reminder'
  | 'rejection_after_screen'
  | 'rejection_after_interview'
  | 'offer_letter'
  | 'offer_follow_up'
  | 'general_response';

export type TemplateChannel = 'email' | 'linkedin' | 'sms' | 'calendar' | 'slack';

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array';
  required: boolean;
  defaultValue?: unknown;
  source: VariableSource;
}

export type VariableSource =
  | 'candidate' // e.g., {{candidate.firstName}}
  | 'requisition' // e.g., {{requisition.title}}
  | 'company' // e.g., {{company.name}}
  | 'recruiter' // e.g., {{recruiter.name}}
  | 'computed'; // Dynamically generated

export interface BrandVoiceConfig {
  tone: ToneStyle;
  formality: 'casual' | 'professional' | 'formal';
  personality: string[]; // e.g., ["friendly", "enthusiastic", "direct"]
  avoidWords: string[];
  preferredPhrases: string[];
  signatureStyle: string;
}

export type ToneStyle = 'warm' | 'professional' | 'enthusiastic' | 'direct' | 'empathetic';

// =============================================================================
// DECISION TREE GUIDELINES
// =============================================================================

export interface DecisionTree {
  id: string;
  name: string;
  description: string;
  domain: WorkflowDomain;
  rootNodeId: string;
  nodes: DecisionNode[];
  metadata: {
    version: number;
    accuracy?: number;
    usageCount: number;
  };
}

export interface DecisionNode {
  id: string;
  type: DecisionNodeType;
  label: string;

  // For decision nodes
  condition?: Condition;
  trueNodeId?: string;
  falseNodeId?: string;

  // For action nodes
  action?: DecisionAction;
  nextNodeId?: string;

  // For outcome nodes
  outcome?: DecisionOutcome;
}

export type DecisionNodeType = 'decision' | 'action' | 'outcome';

export interface DecisionAction {
  type: ActionType;
  config: Record<string, unknown>;
}

export interface DecisionOutcome {
  label: string;
  recommendation: string;
  confidence: number;
  escalate: boolean;
  escalationReason?: EscalationReasonType;
}

// =============================================================================
// CONSTRAINT GUIDELINES
// =============================================================================

export interface Constraint {
  id: string;
  name: string;
  description: string;
  type: ConstraintType;
  scope: ConstraintScope;
  config: ConstraintConfig;
  active: boolean;
  violationAction: 'block' | 'warn' | 'escalate' | 'log';
}

export type ConstraintScope = 'global' | 'workflow' | 'template' | 'channel';

export type ConstraintConfig =
  | RateLimitConfig
  | TimeWindowConfig
  | ApprovalConfig
  | ContentFilterConfig
  | ComplianceConfig;

export interface RateLimitConfig {
  type: 'rate_limit';
  maxCount: number;
  windowMinutes: number;
  perEntity: 'candidate' | 'requisition' | 'tenant';
}

export interface TimeWindowConfig {
  type: 'time_window';
  allowedDays: number[]; // 0-6, Sunday-Saturday
  startHour: number; // 0-23
  endHour: number;
  timezone: string;
}

export interface ApprovalConfig {
  type: 'approval_required';
  actions: ActionType[];
  conditions: Condition[];
}

export interface ContentFilterConfig {
  type: 'content_filter';
  blockedPatterns: string[];
  requiredPatterns?: string[];
}

export interface ComplianceConfig {
  type: 'compliance';
  regulations: string[]; // e.g., ["GDPR", "CCPA", "EEOC"]
  requirements: ComplianceRequirement[];
}

export interface ComplianceRequirement {
  id: string;
  description: string;
  check: Condition;
}

// =============================================================================
// FULL GUIDELINES TYPE
// =============================================================================

export interface GuidelinesContent {
  workflows: WorkflowGuideline[];
  templates: TemplateGuideline[];
  decisionTrees: DecisionTree[];
  constraints: Constraint[];
}

export interface Guidelines {
  id: string;
  tenantId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'REJECTED';
  content: GuidelinesContent;
  createdBy: 'AGENT' | 'TELEOPERATOR' | 'SYSTEM';
  parentVersionId?: string;
  changelog?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}
