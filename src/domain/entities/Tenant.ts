/**
 * Tenant - Multi-tenant foundation
 *
 * Each tenant represents a client company where Riley is deployed.
 * Tenants have isolated:
 * - Guidelines (G) - How to recruit for this company
 * - Criteria (C) - What good recruiting looks like for this company
 * - Candidates, Requisitions, Conversations, etc.
 */

// =============================================================================
// TENANT STATUS (Onboarding Phases)
// =============================================================================

export type TenantStatus =
  | 'ONBOARDING' // Document ingestion phase
  | 'SHADOW_MODE' // Learning from human recruiters
  | 'SUPERVISED' // 100% approval required
  | 'AUTONOMOUS' // Escalation-only supervision
  | 'PAUSED'; // Temporarily disabled

// =============================================================================
// TENANT CONFIGURATION
// =============================================================================

export interface TenantConfig {
  // Company info
  company: CompanyInfo;

  // Autonomy settings
  autonomy: AutonomyConfig;

  // Notification preferences
  notifications: NotificationConfig;

  // Feature flags
  features: FeatureFlags;

  // Compliance settings
  compliance: ComplianceSettings;
}

export interface CompanyInfo {
  name: string;
  website?: string;
  industry?: string;
  size?: CompanySize;
  locations?: string[];
  timezone: string;
  brandVoice?: BrandVoicePreferences;
}

export type CompanySize = 'startup' | 'small' | 'medium' | 'large' | 'enterprise';

export interface BrandVoicePreferences {
  tone: 'casual' | 'professional' | 'formal';
  personality: string[];
  avoidTopics: string[];
  keyMessages: string[];
}

export interface AutonomyConfig {
  // Overall autonomy level
  level: 'conservative' | 'moderate' | 'high';

  // Per-action autonomy overrides
  actionOverrides: ActionAutonomyOverride[];

  // Auto-approval rules
  autoApprovalRules: AutoApprovalRule[];

  // Escalation thresholds
  confidenceThreshold: number; // Below this, escalate
  maxDailyAutoApprovals: number;
}

export interface ActionAutonomyOverride {
  taskType: string;
  requiresApproval: boolean;
  conditions?: OverrideCondition[];
}

export interface OverrideCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface AutoApprovalRule {
  id: string;
  name: string;
  taskTypes: string[];
  conditions: OverrideCondition[];
  maxPerDay?: number;
}

export interface NotificationConfig {
  // Slack integration
  slack?: {
    enabled: boolean;
    webhookUrl: string;
    channel: string;
    notifyOn: NotificationEvent[];
  };

  // Email notifications
  email?: {
    enabled: boolean;
    recipients: string[];
    notifyOn: NotificationEvent[];
  };

  // Urgency routing
  urgencyRouting: UrgencyRoute[];
}

export type NotificationEvent =
  | 'task_pending_approval'
  | 'task_failed'
  | 'candidate_responded'
  | 'interview_scheduled'
  | 'offer_accepted'
  | 'escalation_critical';

export interface UrgencyRoute {
  priority: 'low' | 'medium' | 'high' | 'critical';
  channels: ('dashboard' | 'slack' | 'email')[];
  escalationMinutes?: number;
}

export interface FeatureFlags {
  // Core features
  sourcingEnabled: boolean;
  outreachEnabled: boolean;
  screeningEnabled: boolean;
  schedulingEnabled: boolean;

  // Advanced features
  linkedInEnabled: boolean;
  offerManagementEnabled: boolean;
  analyticsEnabled: boolean;

  // Experimental
  shadowModeEnabled: boolean;
  autoGuidelinesUpdateEnabled: boolean;
}

export interface ComplianceSettings {
  // Data retention
  dataRetentionDays: number;
  candidateConsentRequired: boolean;

  // Communication limits
  maxOutreachPerCandidatePerWeek: number;
  cooldownDaysAfterRejection: number;

  // Regulatory
  gdprCompliant: boolean;
  ccpaCompliant: boolean;
  eeocCompliant: boolean;
}

// =============================================================================
// MAIN TENANT TYPE
// =============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string; // URL-friendly identifier
  status: TenantStatus;
  config: TenantConfig;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// DEFAULT CONFIGURATION
// =============================================================================

export const DEFAULT_TENANT_CONFIG: TenantConfig = {
  company: {
    name: '',
    timezone: 'America/New_York',
  },
  autonomy: {
    level: 'moderate',
    actionOverrides: [],
    autoApprovalRules: [],
    confidenceThreshold: 0.8,
    maxDailyAutoApprovals: 50,
  },
  notifications: {
    urgencyRouting: [
      { priority: 'critical', channels: ['dashboard', 'slack', 'email'], escalationMinutes: 15 },
      { priority: 'high', channels: ['dashboard', 'slack'], escalationMinutes: 60 },
      { priority: 'medium', channels: ['dashboard'], escalationMinutes: 240 },
      { priority: 'low', channels: ['dashboard'] },
    ],
  },
  features: {
    sourcingEnabled: true,
    outreachEnabled: true,
    screeningEnabled: true,
    schedulingEnabled: true,
    linkedInEnabled: false,
    offerManagementEnabled: false,
    analyticsEnabled: true,
    shadowModeEnabled: true,
    autoGuidelinesUpdateEnabled: false,
  },
  compliance: {
    dataRetentionDays: 365,
    candidateConsentRequired: false,
    maxOutreachPerCandidatePerWeek: 3,
    cooldownDaysAfterRejection: 90,
    gdprCompliant: true,
    ccpaCompliant: true,
    eeocCompliant: true,
  },
};
