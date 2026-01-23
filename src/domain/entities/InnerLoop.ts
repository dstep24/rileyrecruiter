/**
 * Inner Loop - Autonomous Agent Cycle
 *
 * The inner loop implements the core Two-Loop Paradigm:
 * 1. Generate: Use Guidelines (G) to create output
 * 2. Evaluate: Score output against Criteria (C)
 * 3. Learn: If score < threshold, update G and regenerate
 *
 * Key principle: Learn-Regenerate, not Edit-Revise
 */

import type { TaskType } from './Task.js';

// =============================================================================
// INNER LOOP STATUS
// =============================================================================

export type InnerLoopStatus =
  | 'RUNNING' // Currently iterating
  | 'CONVERGED' // Met criteria threshold
  | 'MAX_ITERATIONS_REACHED' // Hit iteration limit
  | 'ERROR' // Something went wrong
  | 'CANCELLED'; // Manually stopped

// =============================================================================
// INNER LOOP CONFIGURATION
// =============================================================================

export interface InnerLoopConfig {
  // Convergence settings
  maxIterations: number;
  convergenceThreshold: number; // Score needed to converge (0-1)

  // Learning rate for guidelines updates
  learningRate: number;

  // Timeout
  timeoutSeconds: number;

  // What dimensions to evaluate
  evaluationDimensions: string[];

  // Whether to save intermediate states
  saveIntermediateStates: boolean;
}

export const DEFAULT_INNER_LOOP_CONFIG: InnerLoopConfig = {
  maxIterations: 5,
  convergenceThreshold: 0.8,
  learningRate: 0.1,
  timeoutSeconds: 300,
  evaluationDimensions: ['quality', 'relevance', 'compliance'],
  saveIntermediateStates: true,
};

// =============================================================================
// INNER LOOP CONTEXT
// =============================================================================

export interface InnerLoopContext {
  // Tenant and task info
  tenantId: string;
  taskType: TaskType;

  // Domain selection (optional - if not provided, domain is auto-selected)
  domainSlug?: string;

  // Input data for generation
  input: InnerLoopInput;

  // Current guidelines and criteria versions
  guidelinesVersion: number;
  criteriaVersion: number;

  // Configuration
  config: InnerLoopConfig;
}

export interface InnerLoopInput {
  // Required context
  requisitionId?: string;
  candidateId?: string;
  conversationId?: string;

  // Task-specific data
  data: Record<string, unknown>;

  // Constraints
  constraints?: InnerLoopConstraint[];

  // Domain selection context (used for rule matching)
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

  // Additional domain context for rule matching
  domainContext?: Record<string, unknown>;
}

export interface InnerLoopConstraint {
  type: 'must_include' | 'must_exclude' | 'format' | 'length' | 'custom';
  description: string;
  config: Record<string, unknown>;
}

// =============================================================================
// INNER LOOP ITERATION
// =============================================================================

export interface InnerLoopIteration {
  iterationNumber: number;
  startedAt: Date;
  completedAt?: Date;

  // Generation
  generatedOutput: GeneratedOutput;
  guidelinesUsed: GuidelinesSnapshot;

  // Evaluation
  evaluation: IterationEvaluation;

  // Learning (if not converged)
  learning?: IterationLearning;
}

export interface GeneratedOutput {
  type: string;
  content: unknown; // Task-specific output
  metadata: {
    tokensUsed: number;
    latencyMs: number;
    modelId: string;
  };
}

export interface GuidelinesSnapshot {
  version: number;
  relevantWorkflows: string[];
  relevantTemplates: string[];
  appliedConstraints: string[];
}

export interface IterationEvaluation {
  overallScore: number;
  dimensionScores: DimensionEvaluation[];
  passedThreshold: boolean;
  failures: EvaluationFailure[];
  reasoning: string;
}

export interface DimensionEvaluation {
  dimension: string;
  score: number;
  weight: number;
  criteria: string[];
  evidence: string[];
}

export interface EvaluationFailure {
  dimension: string;
  expectedScore: number;
  actualScore: number;
  reason: string;
  suggestion: string;
}

export interface IterationLearning {
  // What we learned from this iteration
  insights: LearningInsight[];

  // Proposed guidelines updates
  proposedUpdates: GuidelinesUpdate[];

  // The reasoning behind the updates
  reasoning: string;
}

export interface LearningInsight {
  type: 'pattern' | 'gap' | 'conflict' | 'improvement';
  description: string;
  confidence: number;
  source: 'evaluation' | 'comparison' | 'inference';
}

export interface GuidelinesUpdate {
  targetPath: string; // JSON path in guidelines
  operation: 'add' | 'modify' | 'remove';
  currentValue?: unknown;
  newValue?: unknown;
  reason: string;
}

// =============================================================================
// INNER LOOP RUN (Complete record)
// =============================================================================

export interface InnerLoopRun {
  id: string;
  tenantId: string;

  // Context
  taskType: TaskType;
  context: InnerLoopContext;
  contextSnapshot: Record<string, unknown>; // Full context at start

  // Domain selection
  domainId?: string;
  domainName?: string;
  selectionMethod?: 'explicit' | 'rule_match' | 'default' | 'tenant_fallback';

  // Results
  status: InnerLoopStatus;
  iterations: InnerLoopIteration[];
  totalIterations: number;

  // Convergence
  converged: boolean;
  finalScore?: number;

  // Guidelines evolution
  startGuidelinesVersion: number;
  endGuidelinesVersion?: number;
  guidelinesUpdates: GuidelinesUpdate[];

  // Output
  outputTaskId?: string;
  finalOutput?: GeneratedOutput;

  // Timing
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;

  // Error handling
  error?: InnerLoopError;

  createdAt: Date;
}

export interface InnerLoopError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

// =============================================================================
// INNER LOOP RESULT
// =============================================================================

export interface InnerLoopResult {
  runId: string;
  status: InnerLoopStatus;

  // Final output
  output?: GeneratedOutput;
  converged: boolean;
  iterations: number;
  finalScore?: number;

  // Guidelines changes
  guidelinesUpdated: boolean;
  guidelinesUpdates: GuidelinesUpdate[];

  // Task creation
  outputTaskId?: string;
  escalationRequired: boolean;
  escalationReason?: string;

  // Performance
  durationMs: number;
  tokensUsed: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function didConverge(run: InnerLoopRun): boolean {
  return run.status === 'CONVERGED' && run.converged;
}

export function getConvergenceRate(runs: InnerLoopRun[]): number {
  if (runs.length === 0) return 0;
  return runs.filter(didConverge).length / runs.length;
}

export function getAverageIterations(runs: InnerLoopRun[]): number {
  if (runs.length === 0) return 0;
  return runs.reduce((sum, r) => sum + r.totalIterations, 0) / runs.length;
}
