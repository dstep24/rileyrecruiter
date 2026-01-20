/**
 * Outreach Task - Email and LinkedIn Message Generation
 *
 * Generates personalized outreach messages for candidates using:
 * - Templates from Guidelines
 * - Personalization based on candidate data
 * - Evaluation against outreach quality criteria
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

interface OutreachData {
  candidateName: string;
  candidateEmail?: string;
  linkedInUrl?: string;
  roleTitle: string;
  companyName: string;
  candidateProfile: {
    currentTitle?: string;
    currentCompany?: string;
    skills?: string[];
    experience?: string;
    location?: string;
    education?: string;
  };
  requisitionDetails?: {
    description?: string;
    requirements?: string[];
    benefits?: string[];
    salary?: string;
  };
  channel: 'email' | 'linkedin';
  sequenceStep?: number;
}

interface OutreachOutput {
  subject?: string;
  body: string;
  personalizationPoints: string[];
  callToAction: string;
}

// =============================================================================
// OUTREACH TASK
// =============================================================================

export class OutreachTask extends BaseTask {
  constructor(claude: ClaudeClient) {
    super(claude, 'SEND_EMAIL');
  }

  async generate(
    context: TaskContext,
    guidelines: GuidelinesContent
  ): Promise<TaskGenerationResult> {
    const data = context.data as unknown as OutreachData;

    // Find appropriate template
    const templatePurpose = this.getTemplatePurpose(data.sequenceStep);
    const template = this.findTemplate(guidelines, templatePurpose, data.channel);

    // Get workflow for outreach sequence
    const workflow = this.findWorkflow(guidelines, 'outreach_sequence');

    // Build the generation prompt
    const systemPrompt = this.buildSystemPrompt(guidelines, data.channel);
    const userPrompt = this.buildUserPrompt(data, template);

    // Generate the outreach message
    const response = await this.claude.chat({
      systemPrompt,
      prompt: userPrompt,
      temperature: 0.7, // Slightly creative for personalization
      maxTokens: 1500,
    });

    const output = this.claude.parseJsonResponse<OutreachOutput>(response);

    return {
      output: {
        type: data.channel === 'linkedin' ? 'linkedin_message' : 'email',
        content: output,
        format: 'structured',
        taskMetadata: {
          templateUsed: templatePurpose,
          sequenceStep: data.sequenceStep || 1,
          candidateId: context.candidateId,
          channel: data.channel,
        },
      },
      metadata: {
        personalizationPoints: output.personalizationPoints,
        templatePurpose,
      },
    };
  }

  async validate(
    output: GeneratedOutput,
    criteria: CriteriaContent
  ): Promise<TaskValidationResult> {
    const content = output.content as OutreachOutput;
    const issues: ValidationIssue[] = [];
    let score = 1.0;

    // Get outreach quality standards
    const standards = this.getRelevantStandards(criteria, ['outreach', 'communication']);
    const rubric = this.getRelevantRubric(criteria, 'outreach_quality');

    // 1. Check for required components
    if (!content.body || content.body.trim().length === 0) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Message body is empty',
      });
      score -= 0.5;
    }

    if (!content.callToAction || content.callToAction.trim().length === 0) {
      issues.push({
        severity: 'warning',
        dimension: 'effectiveness',
        message: 'Missing clear call-to-action',
      });
      score -= 0.1;
    }

    // 2. Check for personalization
    if (!content.personalizationPoints || content.personalizationPoints.length === 0) {
      issues.push({
        severity: 'warning',
        dimension: 'personalization',
        message: 'No personalization points identified',
      });
      score -= 0.15;
    } else if (content.personalizationPoints.length < 2) {
      issues.push({
        severity: 'info',
        dimension: 'personalization',
        message: 'Consider adding more personalization',
      });
      score -= 0.05;
    }

    // 3. Check message length
    const bodyLength = content.body.length;
    if (bodyLength > 2000) {
      issues.push({
        severity: 'error',
        dimension: 'format',
        message: 'Message too long - may not be read',
        evidence: `Length: ${bodyLength} characters`,
      });
      score -= 0.2;
    } else if (bodyLength < 100) {
      issues.push({
        severity: 'warning',
        dimension: 'format',
        message: 'Message too short - may lack substance',
        evidence: `Length: ${bodyLength} characters`,
      });
      score -= 0.1;
    }

    // 4. Check for placeholder text
    const placeholderPattern = /\{\{.*?\}\}|\[.*?\]|<.*?>/g;
    if (placeholderPattern.test(content.body)) {
      issues.push({
        severity: 'error',
        dimension: 'completeness',
        message: 'Message contains unresolved placeholders',
      });
      score -= 0.3;
    }

    // 5. Use Claude for deeper evaluation
    const aiValidation = await this.aiValidate(content, criteria);
    issues.push(...aiValidation.issues);
    score *= aiValidation.multiplier;

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
    const content = output.content as OutreachOutput;
    const data = context.data as unknown as OutreachData;

    // Analyze validation issues to suggest guideline updates
    for (const issue of validation.issues) {
      if (issue.dimension === 'personalization' && issue.severity !== 'info') {
        learnings.push({
          type: 'guideline_update',
          description: 'Templates may need more personalization guidance',
          suggestedUpdate: {
            targetPath: 'templates.outreach.personalization_requirements',
            operation: 'modify',
            newValue: {
              minimumPoints: 3,
              requiredCategories: ['role_fit', 'background', 'company_connection'],
            },
            rationale: `Message for ${data.roleTitle} lacked sufficient personalization`,
          },
        });
      }

      if (issue.dimension === 'format' && issue.message.includes('too long')) {
        learnings.push({
          type: 'guideline_update',
          description: 'Template may be too verbose',
          suggestedUpdate: {
            targetPath: `templates.${this.getTemplatePurpose(data.sequenceStep)}.maxLength`,
            operation: 'modify',
            newValue: 1500,
            rationale: 'Generated messages consistently exceed comfortable reading length',
          },
        });
      }
    }

    // Check if this represents a new pattern
    if (validation.score < 0.5) {
      learnings.push({
        type: 'pattern_discovered',
        description: `Low success rate for ${data.channel} outreach to ${data.candidateProfile.currentTitle || 'unknown'} roles`,
      });
    }

    return learnings;
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private getTemplatePurpose(sequenceStep?: number): string {
    if (!sequenceStep || sequenceStep === 1) return 'initial_outreach';
    if (sequenceStep === 2) return 'follow_up_1';
    if (sequenceStep === 3) return 'follow_up_2';
    return 'final_attempt';
  }

  private buildSystemPrompt(guidelines: GuidelinesContent, channel: 'email' | 'linkedin'): string {
    // Get brand voice from templates (templates have brand voice config)
    const templateWithVoice = guidelines.templates.find((t) => t.brandVoice);
    const brandVoice = templateWithVoice?.brandVoice;
    const tone = brandVoice?.tone || 'professional';
    const style = brandVoice?.formality || 'professional';

    return `You are Riley, an AI recruiting assistant generating ${channel === 'linkedin' ? 'LinkedIn messages' : 'emails'} for candidate outreach.

## Brand Voice
- Tone: ${tone}
- Style: ${style}

## Guidelines
- Be personalized: Reference specific details about the candidate's background
- Be clear: State the opportunity and why they're a fit
- Be respectful: Acknowledge their time and current situation
- Be actionable: Include a clear, low-commitment call-to-action

## Output Format
Return JSON with this structure:
{
  ${channel === 'email' ? '"subject": "compelling subject line",' : ''}
  "body": "the complete message body",
  "personalizationPoints": ["list of specific personalization elements used"],
  "callToAction": "the specific ask at the end"
}

Remember: This is a first impression. Make it count.`;
  }

  private buildUserPrompt(data: OutreachData, template: string | null): string {
    const profile = data.candidateProfile;

    let prompt = `Generate a ${data.channel === 'linkedin' ? 'LinkedIn message' : 'professional email'} for:

## Candidate
- Name: ${data.candidateName}
- Current Role: ${profile.currentTitle || 'Unknown'} at ${profile.currentCompany || 'Unknown'}
- Skills: ${profile.skills?.join(', ') || 'Not specified'}
- Experience: ${profile.experience || 'Not specified'}
- Location: ${profile.location || 'Not specified'}

## Opportunity
- Role: ${data.roleTitle}
- Company: ${data.companyName}`;

    if (data.requisitionDetails) {
      prompt += `
- Description: ${data.requisitionDetails.description || 'Not provided'}
- Key Requirements: ${data.requisitionDetails.requirements?.join(', ') || 'Not specified'}`;
    }

    if (template) {
      prompt += `

## Template Reference
Use this as a starting point, but personalize heavily:
${template}`;
    }

    prompt += `

## Requirements
- ${data.sequenceStep === 1 ? 'This is an initial outreach - focus on making a strong first impression' : `This is follow-up #${(data.sequenceStep || 1) - 1} - reference previous outreach`}
- Keep the message ${data.channel === 'linkedin' ? 'under 300 words' : 'under 200 words'}
- Include at least 2-3 personalization points specific to this candidate
- Make the call-to-action easy to say yes to`;

    return prompt;
  }

  private async aiValidate(
    content: OutreachOutput,
    criteria: CriteriaContent
  ): Promise<{ issues: ValidationIssue[]; multiplier: number }> {
    const failurePatterns = criteria.failurePatterns.filter((p) =>
      ['outreach', 'communication'].includes(p.domain)
    );

    const response = await this.claude.chat({
      systemPrompt: `You are a quality evaluator for recruiting outreach messages.

## Failure Patterns to Check
${JSON.stringify(failurePatterns, null, 2)}

## Evaluation Dimensions
- Professionalism: Does it maintain a professional tone?
- Authenticity: Does it sound genuine, not robotic?
- Clarity: Is the opportunity clearly communicated?
- Respect: Does it respect the candidate's time?
- Effectiveness: Is the CTA likely to get a response?

Return JSON:
{
  "issues": [
    {"severity": "error|warning|info", "dimension": "string", "message": "string", "evidence": "string"}
  ],
  "overallQuality": 0.0-1.0,
  "recommendation": "approve|revise|reject"
}`,
      prompt: `Evaluate this outreach message:

Subject: ${content.subject || 'N/A'}
Body: ${content.body}
CTA: ${content.callToAction}`,
      temperature: 0.1,
      maxTokens: 1000,
    });

    const result = this.claude.parseJsonResponse<{
      issues: ValidationIssue[];
      overallQuality: number;
      recommendation: string;
    }>(response);

    return {
      issues: result.issues || [],
      multiplier: result.overallQuality || 0.8,
    };
  }
}

// =============================================================================
// LINKEDIN MESSAGE TASK (variant)
// =============================================================================

export class LinkedInMessageTask extends OutreachTask {
  constructor(claude: ClaudeClient) {
    super(claude);
    // Override the task type
    (this as unknown as { taskType: string }).taskType = 'SEND_LINKEDIN_MESSAGE';
  }
}

// =============================================================================
// REGISTRATION
// =============================================================================

registerTask('SEND_EMAIL', OutreachTask);
registerTask('SEND_LINKEDIN_MESSAGE', LinkedInMessageTask);
