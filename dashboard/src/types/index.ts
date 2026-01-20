/**
 * Dashboard Types - Shared types for the teleoperator dashboard
 */

// =============================================================================
// TASK TYPES
// =============================================================================

export type TaskType =
  | 'SEND_EMAIL'
  | 'SEND_LINKEDIN_MESSAGE'
  | 'SEND_FOLLOW_UP'
  | 'SEARCH_CANDIDATES'
  | 'IMPORT_CANDIDATE'
  | 'SCREEN_RESUME'
  | 'GENERATE_ASSESSMENT'
  | 'SCHEDULE_INTERVIEW'
  | 'SEND_REMINDER'
  | 'UPDATE_ATS_STATUS'
  | 'SYNC_CANDIDATE'
  | 'PREPARE_OFFER'
  | 'SEND_OFFER'
  | 'UPDATE_GUIDELINES'
  | 'GENERATE_REPORT';

export type TaskStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'EXPIRED';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type EscalationReason =
  | 'SENSITIVE_COMMUNICATION'
  | 'BUDGET_DISCUSSION'
  | 'OFFER_NEGOTIATION'
  | 'CANDIDATE_COMPLAINT'
  | 'EDGE_CASE'
  | 'LOW_CONFIDENCE'
  | 'POLICY_VIOLATION_RISK'
  | 'FIRST_CONTACT_VIP'
  | 'MANUAL_REVIEW_REQUESTED';

// =============================================================================
// QUEUED TASK
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
  candidateEmail?: string;
  requisitionTitle?: string;
  conversationContext?: string;

  // Metadata
  innerLoopIterations?: number;
  confidenceScore?: number;
  queuedAt: string;
  expiresAt: string | null;

  // Assignment
  assignedTo?: string;
  assignedAt?: string;
}

// =============================================================================
// QUEUE STATS
// =============================================================================

export interface QueueStats {
  totalPending: number;
  byPriority: Record<Priority, number>;
  byType: Record<string, number>;
  byEscalationReason: Record<string, number>;
  avgWaitTimeMinutes: number;
  oldestTaskMinutes: number;
}

// =============================================================================
// APPROVAL
// =============================================================================

export interface ApprovalDecision {
  taskId: string;
  decision: 'approve' | 'reject' | 'edit';
  editedContent?: unknown;
  rejectionReason?: string;
  feedback?: string;
  suggestGuidelinesUpdate?: boolean;
  suggestCriteriaUpdate?: boolean;
}

// =============================================================================
// TENANT
// =============================================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'ONBOARDING' | 'SHADOW_MODE' | 'SUPERVISED' | 'AUTONOMOUS' | 'PAUSED';
  createdAt: string;
}

// =============================================================================
// USER
// =============================================================================

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'teleoperator' | 'viewer';
  tenantIds: string[];
}

// =============================================================================
// GUIDELINES
// =============================================================================

export interface GuidelinesVersion {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'REJECTED';
  createdBy: string;
  changelog: string | null;
  createdAt: string;
}

export interface GuidelinesDiff {
  added: DiffEntry[];
  modified: DiffEntry[];
  removed: DiffEntry[];
  summary: string;
}

export interface DiffEntry {
  path: string;
  type: string;
  name: string;
  before?: unknown;
  after?: unknown;
}

// =============================================================================
// CRITERIA
// =============================================================================

export interface CriteriaVersion {
  id: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  createdBy: string;
  changelog: string | null;
  createdAt: string;
}

// =============================================================================
// API RESPONSES
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
