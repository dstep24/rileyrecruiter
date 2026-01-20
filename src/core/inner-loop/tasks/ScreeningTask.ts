/**
 * Screening Task - Resume Analysis and Candidate Fit Scoring
 *
 * Analyzes candidate profiles against job requirements:
 * - Parses resume/profile data
 * - Scores fit against requirements
 * - Generates assessment reports
 */

import {
  BaseTask,
  TaskContext,
  TaskGenerationResult,
  TaskValidationResult,
  TaskLearning,
  ValidationIssue,
  registerTask,
  GeneratedOutput,
} from './BaseTask.js';
import type { ClaudeClient } from '../../../integrations/llm/ClaudeClient.js';
import type { GuidelinesContent } from '../../../domain/entities/Guidelines.js';
import type { CriteriaContent } from '../../../domain/entities/Criteria.js';

// =============================================================================
// TYPES
// =============================================================================

interface ScreeningData {
  candidateName: string;
  resumeText?: string;
  profileData?: {
    currentTitle?: string;
    currentCompany?: string;
    skills?: string[];
    experience?: Array<{
      title: string;
      company: string;
      duration: string;
      description?: string;
    }>;
    education?: Array<{
      degree: string;
      institution: string;
      year?: string;
    }>;
    location?: string;
    linkedInUrl?: string;
  };
  requisition: {
    title: string;
    requirements: RequirementItem[];
    preferences?: string[];
    description?: string;
    experienceLevel?: string;
    location?: string;
    remote?: boolean;
  };
}

interface RequirementItem {
  category: 'must_have' | 'nice_to_have';
  requirement: string;
  weight?: number;
}

interface ScreeningOutput {
  overallScore: number;
  recommendation: 'strong_yes' | 'yes' | 'maybe' | 'no' | 'strong_no';
  requirementScores: RequirementScore[];
  strengths: string[];
  concerns: string[];
  gaps: string[];
  summary: string;
  suggestedQuestions?: string[];
}

interface RequirementScore {
  requirement: string;
  category: 'must_have' | 'nice_to_have';
  score: number;
  evidence: string;
  confidence: number;
}

// =============================================================================
// SCREENING TASK
// =============================================================================

export class ScreeningTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'SCREEN_RESUME');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    const data = context.data as unknown as ScreeningData;

    // Get screening decision tree
    const decisionTree = this.findDecisionTree(guidelines, 'candidate_screening');

    // Get screening constraints
    const constraints = this.findConstraints(guidelines, 'screening');

    // Build the generation prompt
    const systemPrompt = this.buildSystemPrompt(guidelines, decisionTree);
    const userPrompt = this.buildUserPrompt(data);

    // Generate the screening assessment
    const response = await this.claude.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.2, // Low temperature for consistent scoring
      maxTokens: 3000,
    });

    const output = this.claude.parseJsonResponse<ScreeningOutput>(response);

    return {
      output: {
        type: 'screening_assessment',
        content: output,
        format: 'structured',
        taskMetadata: {
          candidateId: context.candidateId,
          requisitionId: context.requisitionId,
          screeningType: 'initial',
        },
      },
      metadata: {
        overallScore: output.overallScore,
        recommendation: output.recommendation,
        mustHaveScore: this.calculateMustHaveScore(output.requirementScores),
      },
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const content = output.content as ScreeningOutput;
    const issues: ValidationIssue[] = [];
    let score = 1.0;

    // Get screening quality standards
    const standards = this.getRelevantStandards(criteria, ['screening']);
    const rubric = this.getRelevantRubric(criteria, 'resume_screening');

    // 1. Check for required components
    if (content.overallScore === undefined || content.overallScore === null) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Missing overall score',
      });
      score -= 0.5;
    }

    if (!content.recommendation) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Missing recommendation',
      });
      score -= 0.3;
    }

    if (!content.requirementScores || content.requirementScores.length === 0) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Missing requirement scores',
      });
      score -= 0.4;
    }

    // 2. Check score consistency
    if (content.overallScore >= 0.8 && content.recommendation === 'no') {
      issues.push({
        severity: 'warning',
        dimension: 'consistency',
        message: 'High score but negative recommendation - check reasoning',
      });
      score -= 0.15;
    }

    if (content.overallScore <= 0.4 && content.recommendation === 'yes') {
      issues.push({
        severity: 'warning',
        dimension: 'consistency',
        message: 'Low score but positive recommendation - check reasoning',
      });
      score -= 0.15;
    }

    // 3. Check for evidence in scores
    const missingEvidence = content.requirementScores?.filter(
      (rs) => !rs.evidence || rs.evidence.trim().length === 0
    );
    if (missingEvidence && missingEvidence.length > 0) {
      issues.push({
        severity: 'warning',
        dimension: 'evidence',
        message: `${missingEvidence.length} requirement scores lack evidence`,
      });
      score -= 0.1 * Math.min(missingEvidence.length, 3);
    }

    // 4. Check confidence levels
    const lowConfidence = content.requirementScores?.filter(
      (rs) => rs.confidence < 0.5
    );
    if (lowConfidence && lowConfidence.length > content.requirementScores.length * 0.3) {
      issues.push({
        severity: 'info',
        dimension: 'confidence',
        message: 'Many requirement scores have low confidence',
      });
    }

    // 5. Check for summary quality
    if (!content.summary || content.summary.length < 50) {
      issues.push({
        severity: 'warning',
        dimension: 'quality',
        message: 'Summary is too brief',
      });
      score -= 0.1;
    }

    // 6. Use Claude for bias check
    const biasCheck = await this.checkForBias(content, criteria);
    issues.push(...biasCheck.issues);
    if (biasCheck.hasBias) {
      score -= 0.3;
    }

    return {
      valid: score >= 0.7 && !issues.some((i) => i.severity === 'error'),
      score: Math.max(0, Math.min(1, score)),
      issues,
    };
  }

  async extractLearnings(
    context: TaskContext,
    output: GeneratedOutput,
    validation: TaskValidationResult,
    guidelines: GuidelinesContent
  ): Promise<TaskLearning[]> {
    const learnings: TaskLearning[] = [];
    const content = output.content as ScreeningOutput;
    const data = context.data as unknown as ScreeningData;

    // Analyze validation issues to suggest guideline updates
    for (const issue of validation.issues) {
      if (issue.dimension === 'consistency') {
        learnings.push({
          type: 'guideline_update',
          description: 'Scoring to recommendation mapping may need adjustment',
          suggestedUpdate: {
            targetPath: 'decisionTrees.candidate_screening.score_thresholds',
            operation: 'modify',
            newValue: {
              strong_yes: { min: 0.85 },
              yes: { min: 0.7 },
              maybe: { min: 0.5 },
              no: { min: 0.3 },
              strong_no: { max: 0.3 },
            },
            rationale: 'Score-to-recommendation inconsistencies detected',
          },
        });
      }

      if (issue.dimension === 'evidence') {
        learnings.push({
          type: 'guideline_update',
          description: 'Need stricter evidence requirements',
          suggestedUpdate: {
            targetPath: 'constraints.screening.evidence_requirements',
            operation: 'add',
            newValue: {
              minimumEvidenceLength: 20,
              requiredForMustHave: true,
            },
            rationale: 'Requirement scores lacking supporting evidence',
          },
        });
      }
    }

    // Detect patterns in low-confidence scores
    const lowConfidenceRequirements = content.requirementScores?.filter(
      (rs) => rs.confidence < 0.5
    );
    if (lowConfidenceRequirements && lowConfidenceRequirements.length > 0) {
      learnings.push({
        type: 'pattern_discovered',
        description: `Difficulty assessing: ${lowConfidenceRequirements.map((r) => r.requirement).join(', ')}`,
      });
    }

    return learnings;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private buildSystemPrompt(guidelines: GuidelinesContent, decisionTree: unknown): string {
    return `You are Riley, an AI recruiting assistant performing candidate screening.

## Screening Guidelines
- Be objective: Focus on qualifications and fit, not demographics
- Be thorough: Check each requirement systematically
- Be evidence-based: Support every score with specific evidence from the profile
- Be fair: Apply the same standards consistently

## Decision Framework
${decisionTree ? JSON.stringify(decisionTree, null, 2) : 'Use standard screening criteria'}

## Scoring Scale (0.0 - 1.0)
- 0.0-0.2: No evidence of meeting requirement
- 0.2-0.4: Weak evidence or significant gaps
- 0.4-0.6: Partial match, some concerns
- 0.6-0.8: Good match, minor gaps
- 0.8-1.0: Strong match, exceeds expectations

## Recommendation Mapping
- strong_yes: Overall score >= 0.85, all must-haves met
- yes: Overall score >= 0.70, most must-haves met
- maybe: Overall score >= 0.50, some must-haves met
- no: Overall score >= 0.30, key must-haves missing
- strong_no: Overall score < 0.30, fundamental mismatch

## Output Format
Return JSON with this structure:
{
  "overallScore": 0.0-1.0,
  "recommendation": "strong_yes|yes|maybe|no|strong_no",
  "requirementScores": [
    {
      "requirement": "the requirement text",
      "category": "must_have|nice_to_have",
      "score": 0.0-1.0,
      "evidence": "specific evidence from profile",
      "confidence": 0.0-1.0
    }
  ],
  "strengths": ["key strengths"],
  "concerns": ["areas of concern"],
  "gaps": ["missing qualifications"],
  "summary": "2-3 sentence executive summary",
  "suggestedQuestions": ["questions to clarify gaps in interview"]
}

IMPORTANT: Be objective and consistent. Avoid bias based on names, schools, or companies.`;
  }

  private buildUserPrompt(data: ScreeningData): string {
    let prompt = `Screen this candidate for the following role:

## Role: ${data.requisition.title}
${data.requisition.description ? `Description: ${data.requisition.description}` : ''}
Experience Level: ${data.requisition.experienceLevel || 'Not specified'}
Location: ${data.requisition.location || 'Not specified'}
Remote: ${data.requisition.remote ? 'Yes' : 'No'}

## Requirements to Evaluate
`;

    for (const req of data.requisition.requirements) {
      prompt += `- [${req.category.toUpperCase()}] ${req.requirement}\n`;
    }

    if (data.requisition.preferences && data.requisition.preferences.length > 0) {
      prompt += `\n## Preferences\n`;
      for (const pref of data.requisition.preferences) {
        prompt += `- ${pref}\n`;
      }
    }

    prompt += `\n## Candidate: ${data.candidateName}\n`;

    if (data.profileData) {
      const profile = data.profileData;
      prompt += `
Current Role: ${profile.currentTitle || 'Unknown'} at ${profile.currentCompany || 'Unknown'}
Location: ${profile.location || 'Unknown'}
Skills: ${profile.skills?.join(', ') || 'Not listed'}

### Experience
`;
      if (profile.experience && profile.experience.length > 0) {
        for (const exp of profile.experience) {
          prompt += `- ${exp.title} at ${exp.company} (${exp.duration})${exp.description ? `: ${exp.description}` : ''}\n`;
        }
      } else {
        prompt += `No experience data available\n`;
      }

      prompt += `\n### Education\n`;
      if (profile.education && profile.education.length > 0) {
        for (const edu of profile.education) {
          prompt += `- ${edu.degree} from ${edu.institution}${edu.year ? ` (${edu.year})` : ''}\n`;
        }
      } else {
        prompt += `No education data available\n`;
      }
    }

    if (data.resumeText) {
      prompt += `\n## Resume Text\n${data.resumeText.substring(0, 5000)}`;
    }

    prompt += `\n\nProvide a thorough, objective screening assessment.`;

    return prompt;
  }

  private calculateMustHaveScore(scores: RequirementScore[]): number {
    const mustHaves = scores.filter((s) => s.category === 'must_have');
    if (mustHaves.length === 0) return 1.0;

    const totalScore = mustHaves.reduce((sum, s) => sum + s.score, 0);
    return totalScore / mustHaves.length;
  }

  private async checkForBias(
    content: ScreeningOutput,
    criteria: CriteriaContent
  ): Promise<{ hasBias: boolean; issues: ValidationIssue[] }> {
    const failurePatterns = criteria.failurePatterns.filter((p) => p.domain === 'screening');

    const response = await this.claude.chat({
      systemPrompt: `You are a bias detection system for recruiting assessments.

Check for these bias indicators:
1. Assumptions based on candidate name origin
2. School/company prestige bias (favoring "elite" institutions)
3. Gender-coded language or assumptions
4. Age-related assumptions
5. Location bias
6. Inconsistent application of standards

Return JSON:
{
  "hasBias": true/false,
  "issues": [
    {"severity": "error|warning", "dimension": "bias", "message": "description", "evidence": "specific text"}
  ]
}`,
      prompt: `Review this screening assessment for bias:

Recommendation: ${content.recommendation}
Overall Score: ${content.overallScore}
Strengths: ${content.strengths.join(', ')}
Concerns: ${content.concerns.join(', ')}
Summary: ${content.summary}

Requirement Scores and Evidence:
${content.requirementScores.map((rs) => `- ${rs.requirement}: ${rs.score} - "${rs.evidence}"`).join('\n')}`,
      temperature: 0.1,
      maxTokens: 500,
    });

    return this.claude.parseJsonResponse(response);
  }
}

// =============================================================================
// ASSESSMENT GENERATION TASK
// =============================================================================

export class AssessmentTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'GENERATE_ASSESSMENT');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    // Reuse screening logic but with different output format
    const screeningTask = new ScreeningTask(this.claude);
    const result = await screeningTask.generate(context, guidelines);

    // Transform to assessment format
    return {
      output: {
        type: 'detailed_assessment',
        content: result.output.content,
        format: 'structured',
        taskMetadata: {
          ...result.output.taskMetadata,
          assessmentType: 'comprehensive',
        },
      },
      metadata: result.metadata,
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const screeningTask = new ScreeningTask(this.claude);
    return screeningTask.validate(output, criteria);
  }

  async extractLearnings(
    context: TaskContext,
    output: GeneratedOutput,
    validation: TaskValidationResult,
    guidelines: GuidelinesContent
  ): Promise<TaskLearning[]> {
    const screeningTask = new ScreeningTask(this.claude);
    return screeningTask.extractLearnings(context, output, validation, guidelines);
  }
}

// =============================================================================
// REGISTRATION
// =============================================================================

registerTask('SCREEN_RESUME', ScreeningTask);
registerTask('GENERATE_ASSESSMENT', AssessmentTask);
