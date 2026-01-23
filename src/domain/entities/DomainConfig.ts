/**
 * DomainConfig Entity
 *
 * Enables multiple (Guidelines, Criteria) pairs per tenant for domain-specific
 * agent behavior. This is the key to generalizing the two-loop paradigm:
 * "different modes/domains to govern agent performance"
 *
 * Example domains:
 * - "senior-engineering" - stricter quality, personalized outreach
 * - "entry-level" - volume-focused, faster cadence
 * - "healthcare-vertical" - HIPAA-compliant workflows
 */

import type { Condition, ConditionOperator } from './Guidelines.js';

// =============================================================================
// DOMAIN STATUS
// =============================================================================

export type DomainStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

// =============================================================================
// SELECTION RULES
// =============================================================================

/**
 * Selection rule for automatic domain matching
 *
 * @example
 * // Match senior engineering roles
 * {
 *   field: 'requisition.seniority',
 *   operator: 'in',
 *   value: ['senior', 'staff', 'principal'],
 *   logicalOp: 'AND'
 * }
 */
export interface DomainSelectionRule {
  /** Field path to check (e.g., 'requisition.seniority', 'candidate.source') */
  field: string;

  /** Comparison operator */
  operator: ConditionOperator;

  /** Value to compare against */
  value: unknown;

  /** Logical operator for chaining rules (default: AND) */
  logicalOp?: 'AND' | 'OR';
}

// =============================================================================
// CONFIG OVERRIDES
// =============================================================================

/**
 * Domain-specific configuration overrides
 * Merged with base Guidelines/Criteria when the domain is active
 */
export interface DomainConfigOverrides {
  /** Override specific constraints */
  constraints?: Array<{
    id: string;
    type: string;
    config: Record<string, unknown>;
  }>;

  /** Override convergence threshold */
  convergenceThreshold?: number;

  /** Override max iterations */
  maxIterations?: number;

  /** Override evaluation dimensions */
  evaluationDimensions?: string[];

  /** Custom escalation rules for this domain */
  escalationRules?: Array<{
    id: string;
    conditions: Condition[];
    reason: string;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }>;

  /** Additional domain-specific settings */
  [key: string]: unknown;
}

// =============================================================================
// DOMAIN CONFIG ENTITY
// =============================================================================

export interface DomainConfig {
  id: string;
  tenantId: string;

  /** Human-readable name: "Senior Engineering" */
  name: string;

  /** URL-safe identifier: "senior-engineering" */
  slug: string;

  /** Description of when/why to use this domain */
  description?: string;

  /** Rules for automatic domain selection */
  selectionRules: DomainSelectionRule[];

  /** Priority for rule evaluation (higher = checked first) */
  priority: number;

  /** Whether this is the fallback domain for the tenant */
  isDefault: boolean;

  /** ID of the Guidelines version to use for this domain */
  guidelinesId?: string;

  /** ID of the Criteria version to use for this domain */
  criteriaId?: string;

  /** Configuration overrides merged with base G/C */
  configOverrides: DomainConfigOverrides;

  /** Current status */
  status: DomainStatus;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// DOMAIN SELECTION CONTEXT
// =============================================================================

/**
 * Context provided to the DomainSelector for choosing the appropriate domain
 */
export interface DomainSelectionContext {
  /** Explicit domain slug override (highest priority) */
  domainSlug?: string;

  /** Job requisition data for rule matching */
  requisition?: {
    id?: string;
    title?: string;
    seniority?: string;
    department?: string;
    industry?: string;
    location?: string;
    locationType?: string;
    requirements?: unknown[];
    tags?: string[];
    [key: string]: unknown;
  };

  /** Candidate data for rule matching */
  candidate?: {
    id?: string;
    source?: string;
    stage?: string;
    location?: string;
    [key: string]: unknown;
  };

  /** Task type being executed */
  taskType?: string;

  /** Additional context fields */
  [key: string]: unknown;
}

// =============================================================================
// DOMAIN SELECTION RESULT
// =============================================================================

/**
 * Result of domain selection, containing the (G, C) pair to use
 */
export interface DomainSelectionResult {
  /** Selected domain (null if using tenant-level defaults) */
  domain?: DomainConfig;

  /** Guidelines content to use */
  guidelinesId: string;

  /** Criteria content to use */
  criteriaId: string;

  /** How the domain was selected */
  selectionMethod: 'explicit' | 'rule_match' | 'default' | 'tenant_fallback';

  /** Which rule matched (if rule_match) */
  matchedRule?: DomainSelectionRule;
}

// =============================================================================
// DOMAIN ANALYTICS
// =============================================================================

/**
 * Performance metrics for a domain
 */
export interface DomainMetrics {
  domainId: string;
  domainName: string;

  /** Total tasks executed under this domain */
  totalTasks: number;

  /** Inner loop convergence rate */
  convergenceRate: number;

  /** Average iterations to converge */
  avgIterations: number;

  /** Average final score */
  avgFinalScore: number;

  /** Tasks requiring escalation */
  escalationRate: number;

  /** Human approval rate (for supervised tasks) */
  approvalRate: number;

  /** Time period for these metrics */
  periodStart: Date;
  periodEnd: Date;
}

// =============================================================================
// LEARNING RECORD
// =============================================================================

/**
 * Record of learnings applied under a specific domain
 * Used for tracking and cross-domain learning propagation
 */
export interface DomainLearningRecord {
  id: string;
  tenantId: string;
  domainId?: string; // null = tenant-level learning

  /** Source of learning */
  source: 'inner_loop' | 'human_feedback' | 'propagated';

  /** Learning insights */
  insights: Array<{
    type: 'pattern' | 'gap' | 'conflict' | 'improvement';
    description: string;
    confidence: number;
    affectedGuidelines?: string[];
  }>;

  /** Proposed/applied updates */
  updates: Array<{
    targetPath: string;
    operation: 'add' | 'modify' | 'remove';
    newValue?: unknown;
    reason: string;
    applied: boolean;
  }>;

  /** Whether this learning was propagated to other domains */
  propagatedTo?: string[]; // domain IDs

  /** Original domain if this was propagated */
  propagatedFrom?: string; // domain ID

  createdAt: Date;
}

// =============================================================================
// CREATE/UPDATE DTOs
// =============================================================================

export interface CreateDomainConfigInput {
  tenantId: string;
  name: string;
  slug: string;
  description?: string;
  selectionRules?: DomainSelectionRule[];
  priority?: number;
  isDefault?: boolean;
  guidelinesId?: string;
  criteriaId?: string;
  configOverrides?: DomainConfigOverrides;
}

export interface UpdateDomainConfigInput {
  name?: string;
  description?: string;
  selectionRules?: DomainSelectionRule[];
  priority?: number;
  isDefault?: boolean;
  guidelinesId?: string;
  criteriaId?: string;
  configOverrides?: DomainConfigOverrides;
  status?: DomainStatus;
}
