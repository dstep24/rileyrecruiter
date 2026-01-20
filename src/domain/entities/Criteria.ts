/**
 * Criteria (C) - "What Good Recruiting Looks Like"
 *
 * Encodes the evaluative framework for assessing recruiting quality.
 * Agent CANNOT update these autonomously - prevents reward hacking.
 * Only teleoperators can modify Criteria through the outer loop.
 *
 * Using C to evaluate updates in C leads to reward hacking by lowering standards.
 */

// =============================================================================
// QUALITY STANDARDS
// =============================================================================

export interface QualityStandard {
  id: string;
  name: string;
  description: string;
  domain: QualityDomain;

  // The actual standard definition
  definition: StandardDefinition;

  // How important is this standard (for weighted scoring)
  weight: number;

  // Minimum acceptable score (0-1)
  threshold: number;

  // Examples for calibration
  examples: QualityExample[];

  metadata: {
    version: number;
    lastCalibrated?: string;
    calibratedBy?: string;
  };
}

export type QualityDomain =
  | 'sourcing'
  | 'outreach'
  | 'screening'
  | 'scheduling'
  | 'communication'
  | 'candidate_experience';

export interface StandardDefinition {
  // What to measure
  dimension: string;

  // How to measure it
  measurementMethod: MeasurementMethod;

  // Scoring rubric
  scoringLevels: ScoringLevel[];
}

export type MeasurementMethod =
  | 'binary' // Pass/fail
  | 'scale' // 1-5, 1-10, etc.
  | 'percentage' // 0-100%
  | 'count' // Numeric count
  | 'time' // Duration
  | 'llm_evaluation'; // Use LLM to score

export interface ScoringLevel {
  score: number;
  label: string;
  description: string;
  indicators: string[]; // What to look for at this level
}

export interface QualityExample {
  id: string;
  type: 'positive' | 'negative';
  context: string;
  content: string;
  expectedScore: number;
  explanation: string;
}

// =============================================================================
// EVALUATION RUBRICS
// =============================================================================

export interface EvaluationRubric {
  id: string;
  name: string;
  description: string;
  purpose: RubricPurpose;

  // What this rubric evaluates
  targetType: EvaluationTargetType;

  // The dimensions to evaluate
  dimensions: RubricDimension[];

  // How to combine dimension scores
  scoringMethod: ScoringMethod;

  // Pass/fail threshold
  passingScore: number;

  // Calibration examples
  calibrationExamples: CalibrationExample[];

  metadata: {
    version: number;
    usageCount: number;
    avgAccuracy?: number; // Compared to human evaluation
  };
}

export type RubricPurpose =
  | 'resume_screening'
  | 'outreach_quality'
  | 'response_appropriateness'
  | 'interview_scheduling'
  | 'candidate_fit'
  | 'communication_quality';

export type EvaluationTargetType =
  | 'candidate'
  | 'message'
  | 'resume'
  | 'conversation'
  | 'task_output';

export interface RubricDimension {
  id: string;
  name: string;
  description: string;
  weight: number;
  scoreRange: {
    min: number;
    max: number;
  };
  levels: DimensionLevel[];
  evaluationPrompt?: string; // For LLM-based evaluation
}

export interface DimensionLevel {
  score: number;
  label: string;
  criteria: string[];
  examples?: string[];
}

export type ScoringMethod =
  | 'weighted_average' // Sum(score * weight) / Sum(weight)
  | 'minimum_threshold' // All dimensions must meet minimum
  | 'majority' // Most dimensions pass
  | 'holistic'; // LLM provides overall score

export interface CalibrationExample {
  id: string;
  input: Record<string, unknown>;
  expectedScores: Record<string, number>; // dimension -> score
  expectedOverall: number;
  reasoning: string;
}

// =============================================================================
// SUCCESS METRICS
// =============================================================================

export interface SuccessMetric {
  id: string;
  name: string;
  description: string;
  category: MetricCategory;

  // How to calculate this metric
  calculation: MetricCalculation;

  // Target values
  targets: MetricTarget[];

  // Historical benchmarks
  benchmarks: MetricBenchmark[];

  // How often to measure
  frequency: MeasurementFrequency;
}

export type MetricCategory =
  | 'efficiency' // Time-to-fill, response time
  | 'quality' // Hire quality, candidate satisfaction
  | 'volume' // Candidates sourced, interviews scheduled
  | 'conversion' // Stage-to-stage conversion rates
  | 'engagement'; // Response rates, candidate engagement

export interface MetricCalculation {
  formula: string;
  inputs: MetricInput[];
  aggregation: 'sum' | 'average' | 'median' | 'percentage' | 'ratio';
  timeWindow?: number; // In days
}

export interface MetricInput {
  name: string;
  source: 'candidates' | 'tasks' | 'conversations' | 'assessments';
  field: string;
  filter?: Record<string, unknown>;
}

export interface MetricTarget {
  label: string;
  value: number;
  comparison: 'above' | 'below' | 'between';
  upperBound?: number;
}

export interface MetricBenchmark {
  source: 'industry' | 'historical' | 'peer';
  value: number;
  period?: string;
  context?: string;
}

export type MeasurementFrequency = 'real_time' | 'daily' | 'weekly' | 'monthly';

// =============================================================================
// FAILURE PATTERNS
// =============================================================================

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  domain: QualityDomain;

  // How to detect this failure
  detection: FailureDetection;

  // Severity and response
  severity: 'low' | 'medium' | 'high' | 'critical';
  responseAction: FailureResponse;

  // Examples of this failure
  examples: FailureExample[];

  metadata: {
    occurrenceCount: number;
    lastOccurred?: string;
  };
}

export interface FailureDetection {
  method: 'pattern_match' | 'threshold' | 'anomaly' | 'llm_detection';
  config: Record<string, unknown>;
}

export interface FailureResponse {
  action: 'escalate' | 'retry' | 'fallback' | 'block';
  config: Record<string, unknown>;
}

export interface FailureExample {
  id: string;
  context: string;
  failureContent: string;
  whyItFailed: string;
  correctApproach: string;
}

// =============================================================================
// FULL CRITERIA TYPE
// =============================================================================

export interface CriteriaContent {
  qualityStandards: QualityStandard[];
  evaluationRubrics: EvaluationRubric[];
  successMetrics: SuccessMetric[];
  failurePatterns: FailurePattern[];
}

export interface Criteria {
  id: string;
  tenantId: string;
  version: number;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  content: CriteriaContent;
  createdBy: 'AGENT' | 'TELEOPERATOR' | 'SYSTEM';
  parentVersionId?: string;
  changelog?: string;
  effectiveFrom?: Date;
  effectiveUntil?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// EVALUATION RESULT TYPES
// =============================================================================

export interface EvaluationResult {
  rubricId: string;
  targetId: string;
  targetType: EvaluationTargetType;
  dimensionScores: DimensionScore[];
  overallScore: number;
  passed: boolean;
  confidence: number;
  reasoning: string;
  evaluatedAt: Date;
}

export interface DimensionScore {
  dimensionId: string;
  dimensionName: string;
  score: number;
  maxScore: number;
  weight: number;
  evidence: string[];
  reasoning?: string;
}
