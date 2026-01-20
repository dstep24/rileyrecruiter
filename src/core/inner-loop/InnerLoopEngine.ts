/**
 * Inner Loop Engine - Core of Riley's Autonomous Operation
 *
 * Implements the Two-Loop Paradigm's inner loop:
 * 1. GENERATE: Use Guidelines (G) to create output
 * 2. EVALUATE: Score output against Criteria (C)
 * 3. LEARN: If score < threshold, update G and REGENERATE
 *
 * Key principle: Learn-Regenerate, NOT Edit-Revise
 * When output fails to meet criteria, we generate NEW guidelines
 * informed by what didn't work, rather than patching the output.
 *
 * ML Analogy:
 * - Forward Pass: Guidelines (G) → Output (O)
 * - Loss Function: Criteria (C) evaluates Output → Evaluation (E)
 * - Backpropagation: Evaluation (E) → Update to Guidelines (ΔG)
 * - Weight Update: G' = G + ΔG
 */

import { v4 as uuid } from 'uuid';
import { ClaudeClient, getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import { getGuidelinesRepository } from '../../domain/repositories/GuidelinesRepository.js';
import { getTaskRepository } from '../../domain/repositories/TaskRepository.js';
import type {
  InnerLoopConfig,
  InnerLoopContext,
  InnerLoopRun,
  InnerLoopResult,
  InnerLoopIteration,
  InnerLoopStatus,
  GeneratedOutput,
  GuidelinesSnapshot,
  IterationEvaluation,
  IterationLearning,
  GuidelinesUpdate,
  LearningInsight,
} from '../../domain/entities/InnerLoop.js';
import type { TaskType } from '../../domain/entities/Task.js';
import type { GuidelinesContent } from '../../domain/entities/Guidelines.js';
import type { CriteriaContent } from '../../domain/entities/Criteria.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

const DEFAULT_CONFIG: InnerLoopConfig = {
  maxIterations: 5,
  convergenceThreshold: 0.8,
  learningRate: 0.1,
  timeoutSeconds: 300,
  evaluationDimensions: ['quality', 'relevance', 'compliance', 'brand_voice'],
  saveIntermediateStates: true,
};

// =============================================================================
// INNER LOOP ENGINE
// =============================================================================

export class InnerLoopEngine {
  private claude: ClaudeClient;
  private guidelinesRepo = getGuidelinesRepository();
  private taskRepo = getTaskRepository();

  constructor(claude?: ClaudeClient) {
    this.claude = claude || getClaudeClient();
  }

  /**
   * Execute the inner loop for a task
   *
   * This is the core autonomous cycle:
   * 1. Load current Guidelines and Criteria
   * 2. Generate output using Guidelines
   * 3. Evaluate output against Criteria
   * 4. If passed: return converged output
   * 5. If failed: Learn from failure, update Guidelines, regenerate
   */
  async execute(context: InnerLoopContext): Promise<InnerLoopResult> {
    const runId = uuid();
    const startTime = Date.now();
    const config = { ...DEFAULT_CONFIG, ...context.config };

    // Initialize run state
    const run: InnerLoopRun = {
      id: runId,
      tenantId: context.tenantId,
      taskType: context.taskType,
      context,
      contextSnapshot: JSON.parse(JSON.stringify(context.input)),
      status: 'RUNNING',
      iterations: [],
      totalIterations: 0,
      converged: false,
      startGuidelinesVersion: context.guidelinesVersion,
      guidelinesUpdates: [],
      startedAt: new Date(),
      createdAt: new Date(),
    };

    // Load Guidelines and Criteria
    let guidelines = await this.loadGuidelines(context.tenantId);
    const criteria = await this.loadCriteria(context.tenantId);

    let iteration = 0;
    let lastOutput: GeneratedOutput | undefined;
    let lastEvaluation: IterationEvaluation | undefined;

    try {
      // Main loop
      while (iteration < config.maxIterations) {
        iteration++;

        console.log(`[InnerLoop ${runId}] Iteration ${iteration}/${config.maxIterations}`);

        // Check timeout
        if (Date.now() - startTime > config.timeoutSeconds * 1000) {
          run.status = 'ERROR';
          run.error = {
            code: 'TIMEOUT',
            message: `Inner loop timed out after ${config.timeoutSeconds}s`,
            recoverable: true,
          };
          break;
        }

        // 1. GENERATE output using current Guidelines
        const iterationStart = new Date();
        const output = await this.generate(context, guidelines);
        lastOutput = output;

        // Snapshot which guidelines were used
        const guidelinesSnapshot = this.createGuidelinesSnapshot(guidelines, context.taskType);

        // 2. EVALUATE output against Criteria
        const evaluation = await this.evaluate(output, criteria, config.evaluationDimensions);
        lastEvaluation = evaluation;

        // Record iteration
        const iterationRecord: InnerLoopIteration = {
          iterationNumber: iteration,
          startedAt: iterationStart,
          completedAt: new Date(),
          generatedOutput: output,
          guidelinesUsed: guidelinesSnapshot,
          evaluation,
        };

        // 3. Check convergence
        if (evaluation.passedThreshold) {
          console.log(`[InnerLoop ${runId}] Converged at iteration ${iteration} with score ${evaluation.overallScore}`);

          run.converged = true;
          run.status = 'CONVERGED';
          run.finalScore = evaluation.overallScore;
          run.iterations.push(iterationRecord);
          break;
        }

        // 4. LEARN from failure and update Guidelines
        console.log(`[InnerLoop ${runId}] Failed with score ${evaluation.overallScore}, learning...`);

        const learning = await this.learn(output, evaluation, context, guidelines);
        iterationRecord.learning = learning;
        run.iterations.push(iterationRecord);

        // Apply learnings to Guidelines (Learn-Regenerate pattern)
        if (learning.proposedUpdates.length > 0) {
          guidelines = await this.applyLearnings(guidelines, learning, context.tenantId);
          run.guidelinesUpdates.push(...learning.proposedUpdates);
        }
      }

      // Check if we hit max iterations without converging
      if (!run.converged && run.status === 'RUNNING') {
        run.status = 'MAX_ITERATIONS_REACHED';
        run.finalScore = lastEvaluation?.overallScore;
      }

      run.totalIterations = iteration;
      run.completedAt = new Date();
      run.durationMs = Date.now() - startTime;
      run.finalOutput = lastOutput;

      // Determine if escalation is needed
      const escalation = this.determineEscalation(run, context);

      // Create output task if we have output
      let outputTaskId: string | undefined;
      if (lastOutput) {
        const task = await this.createOutputTask(context, lastOutput, run, escalation);
        outputTaskId = task.id;
        run.outputTaskId = outputTaskId;
      }

      return {
        runId,
        status: run.status,
        output: lastOutput,
        converged: run.converged,
        iterations: run.totalIterations,
        finalScore: run.finalScore,
        guidelinesUpdated: run.guidelinesUpdates.length > 0,
        guidelinesUpdates: run.guidelinesUpdates,
        outputTaskId,
        escalationRequired: escalation.required,
        escalationReason: escalation.reason,
        durationMs: run.durationMs || Date.now() - startTime,
        tokensUsed: this.calculateTokensUsed(run.iterations),
      };
    } catch (error) {
      run.status = 'ERROR';
      run.error = {
        code: 'EXECUTION_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: { error },
        recoverable: false,
      };
      run.completedAt = new Date();
      run.durationMs = Date.now() - startTime;

      throw error;
    }
  }

  // ===========================================================================
  // GENERATE - Forward Pass
  // ===========================================================================

  private async generate(
    context: InnerLoopContext,
    guidelines: GuidelinesContent
  ): Promise<GeneratedOutput> {
    const startTime = Date.now();

    // Build generation context from guidelines
    const guidelinesContext = {
      relevantWorkflows: this.getRelevantWorkflows(guidelines, context.taskType),
      relevantTemplates: this.getRelevantTemplates(guidelines, context.taskType),
      brandVoice: this.extractBrandVoice(guidelines),
      constraints: guidelines.constraints,
    };

    const response = await this.claude.generate({
      taskType: context.taskType,
      context: context.input.data,
      guidelines: guidelinesContext,
      constraints: context.input.constraints?.map((c) => ({
        type: c.type,
        description: c.description,
        config: c.config,
      })),
    });

    // Parse the generated output
    const content = this.claude.parseJsonResponse(response);

    return {
      type: context.taskType,
      content,
      metadata: {
        tokensUsed: response.usage.totalTokens,
        latencyMs: Date.now() - startTime,
        modelId: response.model,
      },
    };
  }

  // ===========================================================================
  // EVALUATE - Loss Function
  // ===========================================================================

  private async evaluate(
    output: GeneratedOutput,
    criteria: CriteriaContent,
    dimensions: string[]
  ): Promise<IterationEvaluation> {
    const response = await this.claude.evaluate({
      output: output.content,
      criteria: {
        qualityStandards: criteria.qualityStandards,
        evaluationRubrics: criteria.evaluationRubrics,
        failurePatterns: criteria.failurePatterns,
      },
      dimensions,
    });

    const evaluation = this.claude.parseJsonResponse<{
      overallScore: number;
      dimensionScores: Array<{
        dimension: string;
        score: number;
        weight: number;
        criteria: string[];
        evidence: string[];
        reasoning?: string;
      }>;
      passedThreshold: boolean;
      failures: Array<{
        dimension: string;
        expectedScore: number;
        actualScore: number;
        reason: string;
        suggestion: string;
      }>;
      reasoning: string;
    }>(response);

    return {
      overallScore: evaluation.overallScore,
      dimensionScores: evaluation.dimensionScores.map((ds) => ({
        dimension: ds.dimension,
        score: ds.score,
        weight: ds.weight,
        criteria: ds.criteria,
        evidence: ds.evidence,
      })),
      passedThreshold: evaluation.overallScore >= DEFAULT_CONFIG.convergenceThreshold,
      failures: evaluation.failures,
      reasoning: evaluation.reasoning,
    };
  }

  // ===========================================================================
  // LEARN - Backpropagation
  // ===========================================================================

  private async learn(
    output: GeneratedOutput,
    evaluation: IterationEvaluation,
    context: InnerLoopContext,
    _currentGuidelines: GuidelinesContent
  ): Promise<IterationLearning> {
    const response = await this.claude.extractLearnings({
      failedOutput: output.content,
      evaluation: {
        score: evaluation.overallScore,
        failures: evaluation.failures,
        reasoning: evaluation.reasoning,
      },
      context: {
        taskType: context.taskType,
        input: context.input.data,
      },
    });

    const learnings = this.claude.parseJsonResponse<{
      insights: Array<{
        type: 'pattern' | 'gap' | 'conflict' | 'improvement';
        description: string;
        confidence: number;
        affectedGuidelines?: string[];
      }>;
      proposedUpdates: Array<{
        targetPath: string;
        operation: 'add' | 'modify' | 'remove';
        newValue?: unknown;
        reason: string;
      }>;
      reasoning: string;
    }>(response);

    return {
      insights: learnings.insights.map((i) => ({
        type: i.type,
        description: i.description,
        confidence: i.confidence,
        source: 'evaluation' as const,
      })),
      proposedUpdates: learnings.proposedUpdates.map((u) => ({
        targetPath: u.targetPath,
        operation: u.operation,
        newValue: u.newValue,
        reason: u.reason,
      })),
      reasoning: learnings.reasoning,
    };
  }

  // ===========================================================================
  // APPLY LEARNINGS - Weight Update (Learn-Regenerate)
  // ===========================================================================

  /**
   * Apply learnings to Guidelines
   *
   * Key: This creates a NEW version of guidelines rather than
   * editing in place. This is the "Learn-Regenerate" pattern.
   */
  private async applyLearnings(
    currentGuidelines: GuidelinesContent,
    learning: IterationLearning,
    tenantId: string
  ): Promise<GuidelinesContent> {
    // For significant changes, use Claude to regenerate the affected sections
    if (learning.proposedUpdates.length > 2 || this.hasStructuralChanges(learning)) {
      const response = await this.claude.regenerateGuidelines({
        currentGuidelines,
        learnings: learning.insights,
        context: {
          proposedUpdates: learning.proposedUpdates,
          reasoning: learning.reasoning,
        },
      });

      const regenerated = this.claude.parseJsonResponse<Partial<GuidelinesContent>>(response);

      // Merge regenerated sections with current guidelines
      return {
        workflows: regenerated.workflows || currentGuidelines.workflows,
        templates: regenerated.templates || currentGuidelines.templates,
        decisionTrees: regenerated.decisionTrees || currentGuidelines.decisionTrees,
        constraints: regenerated.constraints || currentGuidelines.constraints,
      };
    }

    // For minor changes, apply updates directly
    const updated = JSON.parse(JSON.stringify(currentGuidelines)) as GuidelinesContent;

    for (const update of learning.proposedUpdates) {
      this.applyUpdate(updated, update);
    }

    return updated;
  }

  private hasStructuralChanges(learning: IterationLearning): boolean {
    return learning.proposedUpdates.some(
      (u) =>
        u.operation === 'add' &&
        (u.targetPath.includes('workflows') || u.targetPath.includes('decisionTrees'))
    );
  }

  private applyUpdate(guidelines: GuidelinesContent, update: GuidelinesUpdate): void {
    // Parse the target path and apply the update
    const parts = update.targetPath.split('.');
    let target: Record<string, unknown> = guidelines as unknown as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);

      if (arrayMatch) {
        const [, arrayName, indexStr] = arrayMatch;
        const index = parseInt(indexStr, 10);
        const arr = target[arrayName] as unknown[];
        target = arr[index] as Record<string, unknown>;
      } else {
        target = target[part] as Record<string, unknown>;
      }
    }

    const finalKey = parts[parts.length - 1];

    switch (update.operation) {
      case 'add':
      case 'modify':
        target[finalKey] = update.newValue;
        break;
      case 'remove':
        delete target[finalKey];
        break;
    }
  }

  // ===========================================================================
  // ESCALATION DETERMINATION
  // ===========================================================================

  private determineEscalation(
    run: InnerLoopRun,
    context: InnerLoopContext
  ): { required: boolean; reason?: string } {
    // Always escalate if didn't converge
    if (!run.converged) {
      return {
        required: true,
        reason: `Inner loop did not converge after ${run.totalIterations} iterations (score: ${run.finalScore?.toFixed(2)})`,
      };
    }

    // Check confidence threshold
    if (run.finalScore && run.finalScore < 0.9) {
      return {
        required: true,
        reason: `Output confidence below threshold: ${run.finalScore.toFixed(2)}`,
      };
    }

    // Check for sensitive task types
    const sensitiveTaskTypes: TaskType[] = [
      'SEND_OFFER',
      'PREPARE_OFFER',
    ];

    if (sensitiveTaskTypes.includes(context.taskType)) {
      return {
        required: true,
        reason: `Sensitive task type: ${context.taskType}`,
      };
    }

    // Check input constraints for escalation flags
    const hasEscalationConstraint = context.input.constraints?.some(
      (c) => c.type === 'custom' && c.config.requiresEscalation
    );

    if (hasEscalationConstraint) {
      return {
        required: true,
        reason: 'Escalation required by input constraint',
      };
    }

    return { required: false };
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  private async loadGuidelines(tenantId: string): Promise<GuidelinesContent> {
    const guidelines = await this.guidelinesRepo.getActiveOrThrow(tenantId);
    return {
      workflows: guidelines.workflows as unknown as GuidelinesContent['workflows'],
      templates: guidelines.templates as unknown as GuidelinesContent['templates'],
      decisionTrees: guidelines.decisionTrees as unknown as GuidelinesContent['decisionTrees'],
      constraints: guidelines.constraints as unknown as GuidelinesContent['constraints'],
    };
  }

  private async loadCriteria(tenantId: string): Promise<CriteriaContent> {
    // For now, return a default criteria structure
    // In production, this would load from the CriteriaRepository
    return {
      qualityStandards: [],
      evaluationRubrics: [],
      successMetrics: [],
      failurePatterns: [],
    };
  }

  private getRelevantWorkflows(
    guidelines: GuidelinesContent,
    taskType: TaskType
  ): GuidelinesContent['workflows'] {
    // Map task types to workflow domains
    const domainMap: Record<string, string> = {
      SEND_EMAIL: 'outreach',
      SEND_LINKEDIN_MESSAGE: 'outreach',
      SEND_FOLLOW_UP: 'outreach',
      SEARCH_CANDIDATES: 'sourcing',
      IMPORT_CANDIDATE: 'sourcing',
      SCREEN_RESUME: 'screening',
      GENERATE_ASSESSMENT: 'screening',
      SCHEDULE_INTERVIEW: 'scheduling',
      SEND_REMINDER: 'scheduling',
      PREPARE_OFFER: 'offer',
      SEND_OFFER: 'offer',
    };

    const domain = domainMap[taskType];
    if (!domain) return guidelines.workflows;

    return guidelines.workflows.filter((w) => w.domain === domain);
  }

  private getRelevantTemplates(
    guidelines: GuidelinesContent,
    taskType: TaskType
  ): GuidelinesContent['templates'] {
    // Map task types to template types
    const typeMap: Record<string, string[]> = {
      SEND_EMAIL: ['email'],
      SEND_LINKEDIN_MESSAGE: ['linkedin_message'],
      SEND_FOLLOW_UP: ['email', 'linkedin_message'],
      SCHEDULE_INTERVIEW: ['email', 'calendar_invite'],
      SEND_REMINDER: ['email', 'sms'],
      SEND_OFFER: ['email'],
    };

    const types = typeMap[taskType];
    if (!types) return guidelines.templates;

    return guidelines.templates.filter((t) => types.includes(t.type));
  }

  private extractBrandVoice(guidelines: GuidelinesContent): unknown {
    // Extract brand voice from templates if available
    const templateWithVoice = guidelines.templates.find((t) => t.brandVoice);
    return templateWithVoice?.brandVoice || {
      tone: 'professional',
      formality: 'professional',
      personality: ['friendly', 'direct'],
    };
  }

  private createGuidelinesSnapshot(
    guidelines: GuidelinesContent,
    taskType: TaskType
  ): GuidelinesSnapshot {
    return {
      version: 1, // Would come from loaded guidelines in production
      relevantWorkflows: this.getRelevantWorkflows(guidelines, taskType).map((w) => w.id),
      relevantTemplates: this.getRelevantTemplates(guidelines, taskType).map((t) => t.id),
      appliedConstraints: guidelines.constraints.filter((c) => c.active).map((c) => c.id),
    };
  }

  private async createOutputTask(
    context: InnerLoopContext,
    output: GeneratedOutput,
    run: InnerLoopRun,
    escalation: { required: boolean; reason?: string }
  ) {
    // Determine escalation reason type
    let escalationReason: 'LOW_CONFIDENCE' | 'EDGE_CASE' | 'SENSITIVE_COMMUNICATION' | undefined;

    if (escalation.required) {
      if (escalation.reason?.includes('confidence')) {
        escalationReason = 'LOW_CONFIDENCE';
      } else if (escalation.reason?.includes('converge')) {
        escalationReason = 'EDGE_CASE';
      } else {
        escalationReason = 'SENSITIVE_COMMUNICATION';
      }
    }

    return this.taskRepo.createDraft(context.tenantId, {
      type: context.taskType,
      payload: output.content as Record<string, unknown>,
      requisitionId: context.input.requisitionId,
      innerLoopId: run.id,
      iterations: run.totalIterations,
      converged: run.converged,
    });
  }

  private calculateTokensUsed(iterations: InnerLoopIteration[]): number {
    return iterations.reduce(
      (sum, iter) => sum + (iter.generatedOutput.metadata.tokensUsed || 0),
      0
    );
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: InnerLoopEngine | null = null;

export function getInnerLoopEngine(): InnerLoopEngine {
  if (!instance) {
    instance = new InnerLoopEngine();
  }
  return instance;
}

export function resetInnerLoopEngine(): void {
  instance = null;
}
