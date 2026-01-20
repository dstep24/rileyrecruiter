/**
 * Criteria Evaluator - Scoring Outputs Against Criteria (C)
 *
 * The "loss function" in the Two-Loop Paradigm ML analogy.
 * Evaluates generated outputs against quality criteria.
 *
 * Key Two-Loop Principle:
 * - Agent CANNOT modify Criteria (prevents reward hacking)
 * - Only teleoperators can update Criteria (outer loop)
 * - Agent uses Criteria as-is for evaluation
 */

import { ClaudeClient, getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type {
  CriteriaContent,
  QualityStandard,
  EvaluationRubric,
  FailurePattern,
  EvaluationResult,
  DimensionScore,
} from '../../domain/entities/Criteria.js';
import type { GeneratedOutput } from '../../domain/entities/InnerLoop.js';

// =============================================================================
// TYPES
// =============================================================================

export interface EvaluationConfig {
  // Minimum score to pass
  passingThreshold: number;

  // Dimensions to evaluate
  dimensions: string[];

  // Whether to include detailed evidence
  includeEvidence: boolean;

  // Whether to detect failure patterns
  checkFailurePatterns: boolean;
}

const DEFAULT_CONFIG: EvaluationConfig = {
  passingThreshold: 0.8,
  dimensions: ['quality', 'relevance', 'compliance', 'brand_voice'],
  includeEvidence: true,
  checkFailurePatterns: true,
};

export interface EvaluationContext {
  // The output to evaluate
  output: GeneratedOutput;

  // Task context
  taskType: string;
  requisitionId?: string;
  candidateId?: string;

  // Additional context
  metadata?: Record<string, unknown>;
}

// =============================================================================
// CRITERIA EVALUATOR
// =============================================================================

export class CriteriaEvaluator {
  private claude: ClaudeClient;

  constructor(claude?: ClaudeClient) {
    this.claude = claude || getClaudeClient();
  }

  /**
   * Evaluate output against criteria
   *
   * This is the "loss function" - it determines how well
   * the output meets the quality criteria.
   */
  async evaluate(
    context: EvaluationContext,
    criteria: CriteriaContent,
    config: Partial<EvaluationConfig> = {}
  ): Promise<EvaluationResult> {
    const cfg = { ...DEFAULT_CONFIG, ...config };

    // Get relevant rubrics for this task type
    const rubrics = this.getRelevantRubrics(criteria.evaluationRubrics, context.taskType);

    // Get relevant quality standards
    const standards = this.getRelevantStandards(criteria.qualityStandards, context.taskType);

    // Get failure patterns to check
    const failurePatterns = cfg.checkFailurePatterns
      ? this.getRelevantFailurePatterns(criteria.failurePatterns, context.taskType)
      : [];

    // Build evaluation prompt
    const evaluationResponse = await this.runEvaluation(
      context.output,
      rubrics,
      standards,
      failurePatterns,
      cfg
    );

    // Check for failure pattern matches
    const failureMatches = cfg.checkFailurePatterns
      ? await this.checkFailurePatterns(context.output, failurePatterns)
      : [];

    // Adjust score based on failure pattern matches
    let adjustedScore = evaluationResponse.overallScore;
    for (const match of failureMatches) {
      adjustedScore *= 1 - match.severity * 0.2; // Reduce score based on severity
    }

    return {
      rubricId: rubrics[0]?.id || 'default',
      targetId: context.output.type,
      targetType: 'task_output',
      dimensionScores: evaluationResponse.dimensionScores,
      overallScore: Math.max(0, adjustedScore),
      passed: adjustedScore >= cfg.passingThreshold,
      confidence: evaluationResponse.confidence,
      reasoning: evaluationResponse.reasoning,
      evaluatedAt: new Date(),
    };
  }

  /**
   * Quick check if output passes basic quality bar
   */
  async quickCheck(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<{ passed: boolean; reason?: string }> {
    // Check against failure patterns first (fast)
    const failurePatterns = criteria.failurePatterns;
    const matches = await this.checkFailurePatterns(output, failurePatterns);

    if (matches.length > 0) {
      const criticalMatch = matches.find((m) => m.severity >= 0.8);
      if (criticalMatch) {
        return {
          passed: false,
          reason: `Critical failure pattern detected: ${criticalMatch.patternName}`,
        };
      }
    }

    // Do a lightweight evaluation
    const response = await this.claude.chat({
      systemPrompt: `You are a quick quality checker. Evaluate if the output meets basic quality standards.
Return JSON: { "passed": true/false, "reason": "brief explanation" }`,
      prompt: `Quick check this output:
${JSON.stringify(output.content, null, 2)}

Basic requirements:
- Is well-formed and complete
- Doesn't contain placeholder text
- Follows professional standards`,
      temperature: 0.1,
      maxTokens: 200,
    });

    return this.claude.parseJsonResponse<{ passed: boolean; reason?: string }>(response);
  }

  // ===========================================================================
  // RUBRIC-BASED EVALUATION
  // ===========================================================================

  private async runEvaluation(
    output: GeneratedOutput,
    rubrics: EvaluationRubric[],
    standards: QualityStandard[],
    failurePatterns: FailurePattern[],
    config: EvaluationConfig
  ): Promise<{
    overallScore: number;
    dimensionScores: DimensionScore[];
    confidence: number;
    reasoning: string;
  }> {
    const systemPrompt = this.buildEvaluationSystemPrompt(rubrics, standards, failurePatterns);
    const userPrompt = this.buildEvaluationUserPrompt(output, config.dimensions);

    const response = await this.claude.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.2, // Low temperature for consistent evaluation
      maxTokens: 2000,
    });

    return this.claude.parseJsonResponse(response);
  }

  private buildEvaluationSystemPrompt(
    rubrics: EvaluationRubric[],
    standards: QualityStandard[],
    failurePatterns: FailurePattern[]
  ): string {
    return `You are an objective quality evaluator for recruiting outputs.

## Evaluation Rubrics
${JSON.stringify(rubrics, null, 2)}

## Quality Standards
${JSON.stringify(standards, null, 2)}

## Failure Patterns to Detect
${JSON.stringify(failurePatterns, null, 2)}

## Scoring Guidelines
- 0.0-0.2: Completely fails to meet criteria
- 0.2-0.4: Major issues, significant rework needed
- 0.4-0.6: Acceptable but with notable concerns
- 0.6-0.8: Good quality, minor improvements possible
- 0.8-1.0: Excellent, meets or exceeds all criteria

## Output Format
Return JSON with this exact structure:
{
  "overallScore": 0.0-1.0,
  "dimensionScores": [
    {
      "dimensionId": "string",
      "dimensionName": "string",
      "score": 0.0-1.0,
      "maxScore": 1.0,
      "weight": 0.0-1.0,
      "evidence": ["specific evidence from output"],
      "reasoning": "explanation of score"
    }
  ],
  "confidence": 0.0-1.0,
  "reasoning": "overall evaluation explanation"
}

Be objective, specific, and evidence-based in your evaluation.`;
  }

  private buildEvaluationUserPrompt(output: GeneratedOutput, dimensions: string[]): string {
    return `Evaluate this output against the criteria:

## Output Type
${output.type}

## Output Content
${JSON.stringify(output.content, null, 2)}

## Dimensions to Evaluate
${dimensions.join(', ')}

Provide detailed, evidence-based evaluation.`;
  }

  // ===========================================================================
  // FAILURE PATTERN DETECTION
  // ===========================================================================

  private async checkFailurePatterns(
    output: GeneratedOutput,
    patterns: FailurePattern[]
  ): Promise<FailurePatternMatch[]> {
    if (patterns.length === 0) return [];

    const response = await this.claude.chat({
      systemPrompt: `You detect failure patterns in outputs.

## Known Failure Patterns
${JSON.stringify(patterns, null, 2)}

Return JSON array of matches:
[
  {
    "patternId": "string",
    "patternName": "string",
    "matched": true/false,
    "severity": 0.0-1.0,
    "evidence": "what triggered the match"
  }
]

Only include patterns that actually match. Return empty array if no matches.`,
      prompt: `Check this output for failure patterns:
${JSON.stringify(output.content, null, 2)}`,
      temperature: 0.1,
      maxTokens: 1000,
    });

    const matches = this.claude.parseJsonResponse<
      Array<{
        patternId: string;
        patternName: string;
        matched: boolean;
        severity: number;
        evidence: string;
      }>
    >(response);

    return matches.filter((m) => m.matched);
  }

  // ===========================================================================
  // CALIBRATION (for teleoperators)
  // ===========================================================================

  /**
   * Compare agent evaluation to human evaluation for calibration
   *
   * This helps teleoperators understand how well the agent's
   * evaluations align with human judgment.
   */
  async calibrate(
    output: GeneratedOutput,
    humanEvaluation: EvaluationResult,
    criteria: CriteriaContent
  ): Promise<CalibrationResult> {
    // Run agent evaluation
    const agentEvaluation = await this.evaluate(
      {
        output,
        taskType: output.type,
      },
      criteria
    );

    // Compare scores
    const scoreDiff = Math.abs(agentEvaluation.overallScore - humanEvaluation.overallScore);
    const dimensionDiffs: DimensionComparison[] = [];

    for (const agentDim of agentEvaluation.dimensionScores) {
      const humanDim = humanEvaluation.dimensionScores.find(
        (d) => d.dimensionId === agentDim.dimensionId
      );

      if (humanDim) {
        dimensionDiffs.push({
          dimensionId: agentDim.dimensionId,
          dimensionName: agentDim.dimensionName,
          agentScore: agentDim.score,
          humanScore: humanDim.score,
          difference: agentDim.score - humanDim.score,
        });
      }
    }

    // Determine alignment
    const isAligned = scoreDiff < 0.15;
    const alignmentScore = 1 - scoreDiff;

    return {
      agentEvaluation,
      humanEvaluation,
      overallDifference: scoreDiff,
      dimensionComparisons: dimensionDiffs,
      isAligned,
      alignmentScore,
      recommendation: this.generateCalibrationRecommendation(dimensionDiffs),
    };
  }

  private generateCalibrationRecommendation(diffs: DimensionComparison[]): string {
    const significantDiffs = diffs.filter((d) => Math.abs(d.difference) > 0.2);

    if (significantDiffs.length === 0) {
      return 'Agent evaluation is well-calibrated with human judgment.';
    }

    const recommendations = significantDiffs.map((d) => {
      if (d.difference > 0) {
        return `Agent over-rates "${d.dimensionName}" - consider tightening criteria`;
      } else {
        return `Agent under-rates "${d.dimensionName}" - consider relaxing criteria`;
      }
    });

    return recommendations.join('\n');
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private getRelevantRubrics(rubrics: EvaluationRubric[], taskType: string): EvaluationRubric[] {
    // Map task types to rubric purposes
    const purposeMap: Record<string, string[]> = {
      SEND_EMAIL: ['outreach_quality', 'communication_quality'],
      SEND_LINKEDIN_MESSAGE: ['outreach_quality', 'communication_quality'],
      SCREEN_RESUME: ['resume_screening', 'candidate_fit'],
      GENERATE_ASSESSMENT: ['candidate_fit'],
      SCHEDULE_INTERVIEW: ['interview_scheduling'],
    };

    const purposes = purposeMap[taskType] || [];
    const relevant = rubrics.filter((r) => purposes.includes(r.purpose));

    // Always return at least one rubric
    return relevant.length > 0 ? relevant : rubrics.slice(0, 1);
  }

  private getRelevantStandards(
    standards: QualityStandard[],
    taskType: string
  ): QualityStandard[] {
    // Map task types to quality domains
    const domainMap: Record<string, string[]> = {
      SEND_EMAIL: ['outreach', 'communication'],
      SEND_LINKEDIN_MESSAGE: ['outreach', 'communication'],
      SCREEN_RESUME: ['screening'],
      GENERATE_ASSESSMENT: ['screening'],
      SCHEDULE_INTERVIEW: ['scheduling'],
    };

    const domains = domainMap[taskType] || [];
    return standards.filter((s) => domains.includes(s.domain));
  }

  private getRelevantFailurePatterns(
    patterns: FailurePattern[],
    taskType: string
  ): FailurePattern[] {
    // Map task types to failure pattern domains
    const domainMap: Record<string, string[]> = {
      SEND_EMAIL: ['outreach', 'communication'],
      SEND_LINKEDIN_MESSAGE: ['outreach', 'communication'],
      SCREEN_RESUME: ['screening'],
      GENERATE_ASSESSMENT: ['screening'],
    };

    const domains = domainMap[taskType] || [];
    return patterns.filter((p) => domains.includes(p.domain));
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface FailurePatternMatch {
  patternId: string;
  patternName: string;
  matched: boolean;
  severity: number;
  evidence: string;
}

interface DimensionComparison {
  dimensionId: string;
  dimensionName: string;
  agentScore: number;
  humanScore: number;
  difference: number;
}

export interface CalibrationResult {
  agentEvaluation: EvaluationResult;
  humanEvaluation: EvaluationResult;
  overallDifference: number;
  dimensionComparisons: DimensionComparison[];
  isAligned: boolean;
  alignmentScore: number;
  recommendation: string;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: CriteriaEvaluator | null = null;

export function getCriteriaEvaluator(): CriteriaEvaluator {
  if (!instance) {
    instance = new CriteriaEvaluator();
  }
  return instance;
}
