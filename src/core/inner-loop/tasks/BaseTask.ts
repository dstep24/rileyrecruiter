/**
 * Base Task - Common Interface for Inner Loop Tasks
 *
 * Each task type implements this interface to define:
 * - How to generate outputs using Guidelines
 * - How to validate outputs against Criteria
 * - What learnings can be extracted from failures
 */

import type { ClaudeClient } from '../../../integrations/llm/ClaudeClient.js';
import type { GuidelinesContent } from '../../../domain/entities/Guidelines.js';
import type { CriteriaContent } from '../../../domain/entities/Criteria.js';
import type { InnerLoopConstraint } from '../../../domain/entities/InnerLoop.js';
import type { TaskType } from '../../../generated/prisma/index.js';

// Extended output type for task implementations
export interface TaskOutput {
  type: string;
  content: unknown;
  format: string;
  taskMetadata?: Record<string, unknown>;
}

// Type alias for compatibility with InnerLoop
export type GeneratedOutput = TaskOutput;

// =============================================================================
// TYPES
// =============================================================================

export interface TaskContext {
  tenantId: string;
  requisitionId?: string;
  candidateId?: string;
  conversationId?: string;
  data: Record<string, unknown>;
  constraints?: InnerLoopConstraint[];
}

export interface TaskGenerationResult {
  output: GeneratedOutput;
  metadata: Record<string, unknown>;
}

export interface TaskValidationResult {
  valid: boolean;
  score: number;
  issues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: 'error' | 'warning' | 'info';
  dimension: string;
  message: string;
  evidence?: string;
}

export interface TaskLearning {
  type: 'guideline_update' | 'pattern_discovered' | 'edge_case';
  description: string;
  suggestedUpdate?: {
    targetPath: string;
    operation: 'add' | 'modify' | 'remove';
    newValue?: unknown;
    oldValue?: unknown;
    rationale: string;
  };
}

// =============================================================================
// BASE TASK
// =============================================================================

export abstract class BaseTask {
  protected claude: ClaudeClient;
  protected taskType: TaskType;

  constructor(claude: ClaudeClient, taskType: TaskType) {
    this.claude = claude;
    this.taskType = taskType;
  }

  /**
   * Generate output using Guidelines
   */
  abstract generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult>;

  /**
   * Validate output against Criteria
   */
  abstract validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult>;

  /**
   * Extract learnings from a failed generation
   */
  abstract extractLearnings(
    context: TaskContext,
    output: GeneratedOutput,
    validation: TaskValidationResult,
    guidelines: GuidelinesContent
  ): Promise<TaskLearning[]>;

  /**
   * Get the task type
   */
  getTaskType(): TaskType {
    return this.taskType;
  }

  // ===========================================================================
  // COMMON UTILITIES
  // ===========================================================================

  /**
   * Find relevant template from Guidelines
   */
  protected findTemplate(
    guidelines: GuidelinesContent,
    purpose: string,
    channel?: string
  ): string | null {
    const template = guidelines.templates.find((t) => {
      const matchesPurpose = t.purpose === purpose || t.name.toLowerCase().includes(purpose.toLowerCase());
      const matchesChannel = !channel || t.channel === channel;
      return matchesPurpose && matchesChannel;
    });

    return template?.body || null;
  }

  /**
   * Find relevant workflow from Guidelines
   */
  protected findWorkflow(
    guidelines: GuidelinesContent,
    domain: string
  ): unknown | null {
    return guidelines.workflows.find((w) => w.domain === domain) || null;
  }

  /**
   * Find relevant decision tree from Guidelines
   */
  protected findDecisionTree(
    guidelines: GuidelinesContent,
    domain: string
  ): unknown | null {
    return guidelines.decisionTrees.find((dt) => dt.domain === domain) || null;
  }

  /**
   * Find relevant constraint from Guidelines
   */
  protected findConstraints(
    guidelines: GuidelinesContent,
    scope: string
  ): unknown[] {
    return guidelines.constraints.filter((c) => c.scope === scope);
  }

  /**
   * Apply template variables
   */
  protected applyTemplateVariables(
    template: string,
    variables: Record<string, string | number | boolean>
  ): string {
    let result = template;

    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      result = result.replace(pattern, String(value));
    }

    return result;
  }

  /**
   * Validate against constraints
   */
  protected async validateConstraints(
    content: string,
    constraints: InnerLoopConstraint[]
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    for (const constraint of constraints) {
      switch (constraint.type) {
        case 'length':
          const maxLength = constraint.config.maxLength as number;
          const minLength = constraint.config.minLength as number;
          if (maxLength && content.length > maxLength) {
            issues.push({
              severity: 'error',
              dimension: 'constraints',
              message: `Content exceeds maximum length of ${maxLength}`,
              evidence: `Current length: ${content.length}`,
            });
          }
          if (minLength && content.length < minLength) {
            issues.push({
              severity: 'warning',
              dimension: 'constraints',
              message: `Content is below minimum length of ${minLength}`,
              evidence: `Current length: ${content.length}`,
            });
          }
          break;

        case 'must_include':
          const mustInclude = constraint.config.values as string[];
          for (const value of mustInclude) {
            if (!content.toLowerCase().includes(value.toLowerCase())) {
              issues.push({
                severity: 'error',
                dimension: 'constraints',
                message: `Content must include: "${value}"`,
              });
            }
          }
          break;

        case 'must_exclude':
          const mustExclude = constraint.config.values as string[];
          for (const value of mustExclude) {
            if (content.toLowerCase().includes(value.toLowerCase())) {
              issues.push({
                severity: 'error',
                dimension: 'constraints',
                message: `Content must not include: "${value}"`,
              });
            }
          }
          break;
      }
    }

    return issues;
  }

  /**
   * Get quality standards for this task type
   */
  protected getRelevantStandards(
    criteria: CriteriaContent,
    domains: string[]
  ): unknown[] {
    return criteria.qualityStandards.filter((s) => domains.includes(s.domain));
  }

  /**
   * Get evaluation rubric for this task type
   */
  protected getRelevantRubric(
    criteria: CriteriaContent,
    purpose: string
  ): unknown | null {
    return criteria.evaluationRubrics.find((r) => r.purpose === purpose) || null;
  }
}

// =============================================================================
// TASK REGISTRY
// =============================================================================

const taskRegistry: Map<TaskType, new (claude: ClaudeClient) => BaseTask> = new Map();

export function registerTask(
  taskType: TaskType,
  taskClass: new (claude: ClaudeClient) => BaseTask
): void {
  taskRegistry.set(taskType, taskClass);
}

export function getTaskImplementation(
  taskType: TaskType,
  claude: ClaudeClient
): BaseTask | null {
  const TaskClass = taskRegistry.get(taskType);
  if (!TaskClass) return null;
  return new TaskClass(claude);
}

export function getRegisteredTaskTypes(): TaskType[] {
  return Array.from(taskRegistry.keys());
}
