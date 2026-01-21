/**
 * AssessmentScorer - AI-powered scoring of pre-screening assessment responses
 *
 * This service uses Claude to:
 * - Evaluate candidate responses against role requirements
 * - Generate an overall fit score (0-100)
 * - Identify flags (sponsorship needed, salary mismatch, etc.)
 * - Produce a human-readable summary for recruiters
 */

import Anthropic from '@anthropic-ai/sdk';
import { preScreeningService, type AssessmentResult } from './PreScreeningService.js';
import type { QuestionType } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ScoringContext {
  roleTitle?: string;
  roleRequirements?: string[];
  salaryRange?: { min: number; max: number };
  locationRequirement?: string;
  sponsorshipAvailable?: boolean;
}

export interface ScoringResult {
  score: number; // 0-100
  summary: string;
  flags: AssessmentFlag[];
  recommendation: 'PROCEED' | 'REVIEW' | 'PASS';
  dimensionScores?: DimensionScore[];
}

export interface AssessmentFlag {
  type: string;
  label: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface DimensionScore {
  dimension: string;
  score: number;
  note: string;
}

interface AnswerForScoring {
  questionText: string;
  questionType: QuestionType;
  answer: string;
  idealAnswer?: string;
  weight: number;
}

// =============================================================================
// SCORING PROMPT
// =============================================================================

const ASSESSMENT_SCORING_PROMPT = `You are an expert technical recruiter evaluating a candidate's pre-screening assessment responses.

## Role Context
{{#if roleTitle}}Title: {{roleTitle}}{{/if}}
{{#if roleRequirements}}Requirements: {{roleRequirements}}{{/if}}
{{#if salaryRange}}Salary Range: \${{salaryRange.min}} - \${{salaryRange.max}}{{/if}}
{{#if locationRequirement}}Location: {{locationRequirement}}{{/if}}
{{#if sponsorshipAvailable}}Visa Sponsorship: {{sponsorshipAvailable}}{{else}}Visa Sponsorship: Not available{{/if}}

## Candidate Responses
{{#each answers}}
**Q{{@index}}: {{questionText}}**
A: {{answer}}
{{#if idealAnswer}}(Ideal: {{idealAnswer}}){{/if}}

{{/each}}

## Your Task
Evaluate this candidate's fit based on their pre-screening responses. Consider:

1. **Work Authorization** - Can they work legally? Do they need sponsorship?
2. **Availability** - Does their timeline match the role's needs?
3. **Compensation Alignment** - Are salary expectations within range?
4. **Role Fit** - Do their answers indicate genuine interest and qualifications?
5. **Red Flags** - Any concerning answers or misalignment?

## Scoring Guidelines

- **90-100**: Excellent fit, proceed immediately
- **70-89**: Good fit, worth pursuing
- **50-69**: Possible fit, needs review
- **30-49**: Weak fit, significant concerns
- **0-29**: Poor fit, likely not viable

## Output Format (JSON only)
{
  "score": <0-100>,
  "summary": "<2-3 sentence assessment summary>",
  "flags": [
    {
      "type": "<flag_type>",
      "label": "<human readable label>",
      "severity": "<info|warning|critical>"
    }
  ],
  "recommendation": "<PROCEED|REVIEW|PASS>",
  "dimensionScores": [
    {
      "dimension": "Work Authorization",
      "score": <0-100>,
      "note": "<brief note>"
    },
    {
      "dimension": "Availability",
      "score": <0-100>,
      "note": "<brief note>"
    },
    {
      "dimension": "Compensation",
      "score": <0-100>,
      "note": "<brief note>"
    },
    {
      "dimension": "Role Fit",
      "score": <0-100>,
      "note": "<brief note>"
    }
  ]
}

Common flag types:
- "sponsorship_needed" - Requires visa sponsorship
- "sponsorship_uncertain" - Work authorization unclear
- "salary_high" - Expectations above range
- "salary_low" - Expectations below range (might indicate mismatch)
- "availability_delayed" - Not available soon enough
- "availability_immediate" - Available right away (positive flag, info severity)
- "relocation_required" - Would need to relocate
- "remote_preferred" - Prefers remote work
- "experience_gap" - Missing key experience
- "strong_interest" - Shows genuine enthusiasm (positive flag, info severity)

IMPORTANT: Return ONLY valid JSON, no markdown formatting or extra text.`;

// =============================================================================
// SERVICE
// =============================================================================

export class AssessmentScorer {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic();
  }

  /**
   * Score a completed assessment
   */
  async scoreAssessment(
    responseId: string,
    context?: ScoringContext
  ): Promise<ScoringResult> {
    // Get the assessment data
    const assessment = await preScreeningService.getAssessmentById(responseId);

    if (!assessment) {
      throw new Error(`Assessment not found: ${responseId}`);
    }

    if (assessment.response.status !== 'COMPLETED') {
      throw new Error(`Assessment not completed: ${responseId}`);
    }

    // Build answers for scoring
    const answersForScoring: AnswerForScoring[] = assessment.answers.map((a) => ({
      questionText: a.question.questionText,
      questionType: a.question.questionType,
      answer: a.answerText,
      idealAnswer: a.question.idealAnswer ?? undefined,
      weight: a.question.scoringWeight,
    }));

    // Generate the prompt
    const prompt = this.buildPrompt(answersForScoring, context);

    // Call Claude for scoring
    const result = await this.callClaude(prompt);

    // Save the scoring results
    await preScreeningService.updateScoringResults(responseId, {
      aiScore: result.score,
      aiSummary: result.summary,
      aiFlags: result.flags.map((f) => f.type),
    });

    return result;
  }

  /**
   * Score an assessment by conversation ID
   */
  async scoreByConversation(
    conversationId: string,
    context?: ScoringContext
  ): Promise<ScoringResult | null> {
    const assessment = await preScreeningService.getAssessmentForConversation(conversationId);

    if (!assessment || assessment.response.status !== 'COMPLETED') {
      return null;
    }

    return this.scoreAssessment(assessment.response.id, context);
  }

  /**
   * Build the scoring prompt from template
   */
  private buildPrompt(answers: AnswerForScoring[], context?: ScoringContext): string {
    let prompt = ASSESSMENT_SCORING_PROMPT;

    // Replace role context placeholders
    if (context?.roleTitle) {
      prompt = prompt.replace('{{#if roleTitle}}Title: {{roleTitle}}{{/if}}', `Title: ${context.roleTitle}`);
    } else {
      prompt = prompt.replace('{{#if roleTitle}}Title: {{roleTitle}}{{/if}}', '');
    }

    if (context?.roleRequirements?.length) {
      prompt = prompt.replace(
        '{{#if roleRequirements}}Requirements: {{roleRequirements}}{{/if}}',
        `Requirements: ${context.roleRequirements.join(', ')}`
      );
    } else {
      prompt = prompt.replace('{{#if roleRequirements}}Requirements: {{roleRequirements}}{{/if}}', '');
    }

    if (context?.salaryRange) {
      prompt = prompt.replace(
        '{{#if salaryRange}}Salary Range: \${{salaryRange.min}} - \${{salaryRange.max}}{{/if}}',
        `Salary Range: $${context.salaryRange.min.toLocaleString()} - $${context.salaryRange.max.toLocaleString()}`
      );
    } else {
      prompt = prompt.replace('{{#if salaryRange}}Salary Range: \${{salaryRange.min}} - \${{salaryRange.max}}{{/if}}', '');
    }

    if (context?.locationRequirement) {
      prompt = prompt.replace(
        '{{#if locationRequirement}}Location: {{locationRequirement}}{{/if}}',
        `Location: ${context.locationRequirement}`
      );
    } else {
      prompt = prompt.replace('{{#if locationRequirement}}Location: {{locationRequirement}}{{/if}}', '');
    }

    if (context?.sponsorshipAvailable !== undefined) {
      prompt = prompt.replace(
        '{{#if sponsorshipAvailable}}Visa Sponsorship: {{sponsorshipAvailable}}{{else}}Visa Sponsorship: Not available{{/if}}',
        `Visa Sponsorship: ${context.sponsorshipAvailable ? 'Available' : 'Not available'}`
      );
    } else {
      prompt = prompt.replace(
        '{{#if sponsorshipAvailable}}Visa Sponsorship: {{sponsorshipAvailable}}{{else}}Visa Sponsorship: Not available{{/if}}',
        'Visa Sponsorship: Not specified'
      );
    }

    // Build answers section
    const answersSection = answers
      .map((a, i) => {
        let section = `**Q${i + 1}: ${a.questionText}**\nA: ${a.answer}`;
        if (a.idealAnswer) {
          section += `\n(Ideal: ${a.idealAnswer})`;
        }
        return section;
      })
      .join('\n\n');

    prompt = prompt.replace(
      '{{#each answers}}\n**Q{{@index}}: {{questionText}}**\nA: {{answer}}\n{{#if idealAnswer}}(Ideal: {{idealAnswer}}){{/if}}\n\n{{/each}}',
      answersSection
    );

    return prompt;
  }

  /**
   * Call Claude API for scoring
   */
  private async callClaude(prompt: string): Promise<ScoringResult> {
    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        temperature: 0.3, // Low temperature for consistent scoring
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      // Extract text content
      const textContent = response.content.find((c) => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      // Parse JSON response
      const result = JSON.parse(textContent.text) as ScoringResult;

      // Validate the result
      if (typeof result.score !== 'number' || result.score < 0 || result.score > 100) {
        throw new Error('Invalid score in response');
      }

      if (!result.summary || typeof result.summary !== 'string') {
        throw new Error('Invalid summary in response');
      }

      if (!result.recommendation || !['PROCEED', 'REVIEW', 'PASS'].includes(result.recommendation)) {
        result.recommendation = result.score >= 70 ? 'PROCEED' : result.score >= 50 ? 'REVIEW' : 'PASS';
      }

      if (!Array.isArray(result.flags)) {
        result.flags = [];
      }

      return result;
    } catch (error) {
      console.error('[AssessmentScorer] Claude API error:', error);

      // Return a fallback result on error
      return {
        score: 50,
        summary: 'Unable to automatically score assessment. Manual review required.',
        flags: [
          {
            type: 'scoring_error',
            label: 'Automated scoring failed',
            severity: 'warning',
          },
        ],
        recommendation: 'REVIEW',
      };
    }
  }

  /**
   * Generate a simple heuristic score (fallback when no API key)
   */
  static heuristicScore(assessment: AssessmentResult): ScoringResult {
    const answers = assessment.answers;
    let totalWeight = 0;
    let weightedScore = 0;
    const flags: AssessmentFlag[] = [];

    for (const answer of answers) {
      const weight = answer.question.scoringWeight;
      totalWeight += weight;

      // Simple matching logic
      if (answer.question.idealAnswer) {
        const idealLower = answer.question.idealAnswer.toLowerCase();
        const answerLower = answer.answerText.toLowerCase();

        if (answerLower === idealLower || answerLower.includes(idealLower)) {
          weightedScore += weight * 100;
        } else if (answerLower.includes('yes') && idealLower.includes('yes')) {
          weightedScore += weight * 100;
        } else if (answerLower.includes('no') && idealLower.includes('no')) {
          weightedScore += weight * 100;
        } else {
          weightedScore += weight * 50; // Partial credit for attempt
        }
      } else {
        // No ideal answer, give neutral score
        weightedScore += weight * 70;
      }

      // Detect common flags from question text and answers
      const qLower = answer.question.questionText.toLowerCase();
      const aLower = answer.answerText.toLowerCase();

      if (qLower.includes('visa') || qLower.includes('sponsorship') || qLower.includes('authorization')) {
        if (aLower.includes('yes') || aLower.includes('need') || aLower.includes('require')) {
          flags.push({
            type: 'sponsorship_needed',
            label: 'Requires visa sponsorship',
            severity: 'warning',
          });
        }
      }

      if (qLower.includes('salary') || qLower.includes('compensation')) {
        // Could add salary parsing logic here
      }

      if (qLower.includes('start') || qLower.includes('available') || qLower.includes('notice')) {
        if (aLower.includes('immediately') || aLower.includes('now') || aLower.includes('asap')) {
          flags.push({
            type: 'availability_immediate',
            label: 'Available immediately',
            severity: 'info',
          });
        }
      }
    }

    const score = totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 50;

    return {
      score,
      summary: `Heuristic score based on ${answers.length} responses. Manual review recommended for accurate assessment.`,
      flags,
      recommendation: score >= 70 ? 'PROCEED' : score >= 50 ? 'REVIEW' : 'PASS',
    };
  }
}

// Export singleton instance
export const assessmentScorer = new AssessmentScorer();
