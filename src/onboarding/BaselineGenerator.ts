/**
 * Baseline Guidelines & Criteria Generator
 *
 * Generates initial Guidelines (G) and Criteria (C) from extracted patterns.
 * This is the starting point for a new tenant - these will evolve through
 * the inner loop learning process.
 *
 * Key principle: Start conservative (high oversight) and loosen as Riley proves reliable.
 */

import { v4 as uuid } from 'uuid';
import { getClaudeClient, ClaudeClient } from '../integrations/llm/ClaudeClient.js';
import type {
  ExtractedPatterns,
  RolePattern,
  BrandVoicePattern,
  SuccessFactorPattern,
  CommunicationPattern,
} from './PatternExtraction.js';

// =============================================================================
// BASELINE TYPES (simplified for initial generation)
// =============================================================================

// These are simplified types for baseline generation.
// They will be converted to full domain types when persisted.

export interface GuidelinesContent {
  workflows: WorkflowGuideline[];
  templates: TemplateGuideline[];
  decisionTrees: WorkflowStage[];
  constraints: ConstraintGuideline[];
}

export interface WorkflowGuideline {
  id: string;
  name: string;
  description: string;
  stages: WorkflowStage[];
  triggers: string[];
  constraints: string[];
}

export interface WorkflowStage {
  name: string;
  actions: string[];
  nextStage: string | null;
  conditions: string[];
}

export interface TemplateGuideline {
  id: string;
  name: string;
  channel: string;
  purpose: string;
  subject?: string;
  body: string;
  variables: Array<{ name: string; description: string; required: boolean }>;
  tone: string;
}

export interface ConstraintGuideline {
  id: string;
  name: string;
  type: string;
  description: string;
  config: Record<string, unknown>;
  enforcement: 'hard' | 'soft';
}

export interface CriteriaContent {
  qualityStandards: QualityStandard[];
  evaluationRubrics: EvaluationRubric[];
  failurePatterns: FailurePattern[];
  successMetrics: Record<string, { target: number; warning: number; critical: number }>;
}

export interface QualityStandard {
  id: string;
  name: string;
  description: string;
  dimensions: Array<{ name: string; description: string; weight: number; minScore: number }>;
  threshold: number;
}

export interface EvaluationRubric {
  id: string;
  name: string;
  taskType: string;
  dimensions: Array<{
    name: string;
    description: string;
    criteria: string[];
    scoringGuide: Record<string, string>;
    weight: number;
  }>;
}

export interface FailurePattern {
  id: string;
  name: string;
  description: string;
  indicators: string[];
  severity: 'moderate' | 'high' | 'critical';
  remediation: string;
}

// =============================================================================
// CONFIG TYPES
// =============================================================================

export interface BaselineGeneratorConfig {
  conservativeMode: boolean; // Start with higher thresholds
  defaultApprovalThreshold: number;
}

const DEFAULT_CONFIG: BaselineGeneratorConfig = {
  conservativeMode: true,
  defaultApprovalThreshold: 0.85, // High initial threshold
};

export interface GeneratedBaseline {
  tenantId: string;
  guidelines: GuidelinesContent;
  criteria: CriteriaContent;
  metadata: BaselineMetadata;
}

export interface BaselineMetadata {
  generatedAt: Date;
  sourcePatterns: string;
  confidence: number;
  notes: string[];
}

// =============================================================================
// BASELINE GENERATOR SERVICE
// =============================================================================

export class BaselineGeneratorService {
  private config: BaselineGeneratorConfig;
  private claude: ClaudeClient;

  constructor(config: Partial<BaselineGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.claude = getClaudeClient();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Generate baseline Guidelines and Criteria from extracted patterns
   */
  async generateBaseline(patterns: ExtractedPatterns): Promise<GeneratedBaseline> {
    const guidelines = await this.generateGuidelines(patterns);
    const criteria = await this.generateCriteria(patterns);

    // Calculate overall confidence
    const patternConfidences = [
      ...patterns.roles.map((r) => r.confidence),
      patterns.brandVoice?.confidence ?? 0,
      ...patterns.successFactors.map((f) => f.confidence),
      ...patterns.communications.map((c) => c.confidence),
    ].filter((c) => c > 0);

    const avgConfidence =
      patternConfidences.length > 0
        ? patternConfidences.reduce((a, b) => a + b, 0) / patternConfidences.length
        : 0.5;

    return {
      tenantId: patterns.tenantId,
      guidelines,
      criteria,
      metadata: {
        generatedAt: new Date(),
        sourcePatterns: patterns.sourceDocuments.join(', '),
        confidence: avgConfidence,
        notes: this.generateNotes(patterns),
      },
    };
  }

  // ===========================================================================
  // GUIDELINES GENERATION
  // ===========================================================================

  private async generateGuidelines(patterns: ExtractedPatterns): Promise<GuidelinesContent> {
    const workflows = this.generateWorkflows(patterns);
    const templates = await this.generateTemplates(patterns);
    const decisionTrees = this.generateDecisionTrees(patterns);
    const constraints = this.generateConstraints(patterns);

    return {
      workflows,
      templates,
      decisionTrees,
      constraints,
    };
  }

  /**
   * Generate workflow guidelines from patterns
   */
  private generateWorkflows(patterns: ExtractedPatterns): WorkflowGuideline[] {
    const workflows: WorkflowGuideline[] = [];

    // 1. Sourcing Workflow
    workflows.push({
      id: uuid(),
      name: 'Candidate Sourcing',
      description: 'Find and import potential candidates',
      stages: [
        {
          name: 'Define Search',
          actions: ['Build search query from role requirements', 'Set geographic filters', 'Define experience range'],
          nextStage: 'Execute Search',
          conditions: ['Role requirements available'],
        },
        {
          name: 'Execute Search',
          actions: ['Search LinkedIn profiles', 'Search ATS database', 'Dedupe results'],
          nextStage: 'Initial Screen',
          conditions: ['Search query defined'],
        },
        {
          name: 'Initial Screen',
          actions: ['Score against role fit', 'Check for red flags', 'Rank candidates'],
          nextStage: 'Queue for Outreach',
          conditions: ['Candidates found'],
        },
        {
          name: 'Queue for Outreach',
          actions: ['Create candidate records', 'Add to outreach queue', 'Set priority'],
          nextStage: null,
          conditions: ['Screen complete'],
        },
      ],
      triggers: ['New requisition created', 'Pipeline below threshold'],
      constraints: ['Max 100 searches/day', 'Respect rate limits'],
    });

    // 2. Outreach Workflow
    workflows.push({
      id: uuid(),
      name: 'Candidate Outreach',
      description: 'Initial contact and follow-up sequence',
      stages: [
        {
          name: 'Prepare Message',
          actions: ['Select template', 'Personalize content', 'Review against guidelines'],
          nextStage: 'Send Initial',
          conditions: ['Candidate in queue', 'Template available'],
        },
        {
          name: 'Send Initial',
          actions: ['Send via preferred channel', 'Log interaction', 'Schedule follow-up'],
          nextStage: 'Wait for Response',
          conditions: ['Message approved'],
        },
        {
          name: 'Wait for Response',
          actions: ['Monitor for reply', 'Track open/click', 'Check timeout'],
          nextStage: 'Follow Up',
          conditions: ['No response after wait period'],
        },
        {
          name: 'Follow Up',
          actions: ['Send follow-up message', 'Update attempt count', 'Check max attempts'],
          nextStage: 'Wait for Response',
          conditions: ['Under max attempts'],
        },
      ],
      triggers: ['Candidate added to queue', 'Follow-up timer expired'],
      constraints: ['Max 3 follow-ups', 'Wait 3 days between'],
    });

    // 3. Screening Workflow
    workflows.push({
      id: uuid(),
      name: 'Candidate Screening',
      description: 'Evaluate candidate fit',
      stages: [
        {
          name: 'Resume Review',
          actions: ['Parse resume', 'Extract experience', 'Score against requirements'],
          nextStage: 'Fit Assessment',
          conditions: ['Resume available'],
        },
        {
          name: 'Fit Assessment',
          actions: ['Evaluate technical fit', 'Assess culture indicators', 'Calculate overall score'],
          nextStage: 'Decision',
          conditions: ['Resume scored'],
        },
        {
          name: 'Decision',
          actions: ['Compare to threshold', 'Generate recommendation', 'Queue for review if borderline'],
          nextStage: null,
          conditions: ['Assessment complete'],
        },
      ],
      triggers: ['Candidate responds positively', 'Application received'],
      constraints: ['Require human review below threshold'],
    });

    // 4. Scheduling Workflow
    workflows.push({
      id: uuid(),
      name: 'Interview Scheduling',
      description: 'Coordinate interview logistics',
      stages: [
        {
          name: 'Find Availability',
          actions: ['Query interviewer calendars', 'Get candidate availability', 'Find overlaps'],
          nextStage: 'Propose Times',
          conditions: ['Interviewer assigned'],
        },
        {
          name: 'Propose Times',
          actions: ['Select best options', 'Send to candidate', 'Set response deadline'],
          nextStage: 'Confirm',
          conditions: ['Available slots found'],
        },
        {
          name: 'Confirm',
          actions: ['Book calendar event', 'Send confirmations', 'Add video link'],
          nextStage: 'Remind',
          conditions: ['Candidate selected time'],
        },
        {
          name: 'Remind',
          actions: ['Send reminder 24h before', 'Send reminder 1h before', 'Update if rescheduled'],
          nextStage: null,
          conditions: ['Interview scheduled'],
        },
      ],
      triggers: ['Screening passed', 'Interview requested'],
      constraints: ['Min 24h notice', 'Respect timezone preferences'],
    });

    return workflows;
  }

  /**
   * Generate message templates from communication patterns
   */
  private async generateTemplates(patterns: ExtractedPatterns): Promise<TemplateGuideline[]> {
    const templates: TemplateGuideline[] = [];
    const brandVoice = patterns.brandVoice;

    // Generate from existing communication patterns
    for (const comm of patterns.communications) {
      templates.push({
        id: uuid(),
        name: `${comm.purpose} - ${comm.channel}`,
        channel: comm.channel,
        purpose: comm.purpose,
        subject: comm.template.subjectLine,
        body: comm.template.body,
        variables: comm.template.variables.map((v) => ({
          name: v,
          description: `Variable: ${v}`,
          required: true,
        })),
        tone: brandVoice?.tone.formality || 'professional',
      });
    }

    // Add default templates if none exist
    if (templates.length === 0) {
      templates.push(
        // Initial outreach
        {
          id: uuid(),
          name: 'Initial Outreach - Email',
          channel: 'email',
          purpose: 'initial_outreach',
          subject: '{{role_title}} opportunity at {{company_name}}',
          body: `Hi {{candidate_name}},

I came across your profile and was impressed by your experience in {{relevant_skill}}.

We're looking for a {{role_title}} to join our {{department}} team, and I think your background could be a great fit.

Would you be open to a brief conversation to learn more?

Best regards,
{{sender_name}}`,
          variables: [
            { name: 'candidate_name', description: 'First name', required: true },
            { name: 'role_title', description: 'Job title', required: true },
            { name: 'company_name', description: 'Company', required: true },
            { name: 'relevant_skill', description: 'Key skill', required: true },
            { name: 'department', description: 'Team/dept', required: false },
            { name: 'sender_name', description: 'Recruiter name', required: true },
          ],
          tone: 'professional',
        },
        // Follow-up
        {
          id: uuid(),
          name: 'Follow Up - Email',
          channel: 'email',
          purpose: 'follow_up',
          subject: 'Re: {{role_title}} opportunity',
          body: `Hi {{candidate_name}},

I wanted to follow up on my previous message about the {{role_title}} role.

I understand you're likely busy, but I'd love the chance to share more about what we're building. Even a quick 15-minute call could be valuable.

Would any time this week work for you?

Best,
{{sender_name}}`,
          variables: [
            { name: 'candidate_name', description: 'First name', required: true },
            { name: 'role_title', description: 'Job title', required: true },
            { name: 'sender_name', description: 'Recruiter name', required: true },
          ],
          tone: 'professional',
        },
        // LinkedIn message
        {
          id: uuid(),
          name: 'Initial Outreach - LinkedIn',
          channel: 'linkedin',
          purpose: 'initial_outreach',
          body: `Hi {{candidate_name}}, your background in {{relevant_skill}} caught my eye. We have a {{role_title}} opening that might interest you. Open to connecting?`,
          variables: [
            { name: 'candidate_name', description: 'First name', required: true },
            { name: 'relevant_skill', description: 'Key skill', required: true },
            { name: 'role_title', description: 'Job title', required: true },
          ],
          tone: 'conversational',
        }
      );
    }

    return templates;
  }

  /**
   * Generate decision trees from patterns
   */
  private generateDecisionTrees(patterns: ExtractedPatterns): WorkflowGuideline['stages'] {
    // Create decision trees for common scenarios
    return [
      {
        name: 'Response Classification',
        actions: ['Analyze response sentiment', 'Classify intent', 'Route appropriately'],
        nextStage: null,
        conditions: ['Candidate replied'],
      },
      {
        name: 'Escalation Check',
        actions: ['Check if requires human review', 'Evaluate confidence', 'Route to queue if needed'],
        nextStage: null,
        conditions: ['Action pending'],
      },
    ];
  }

  /**
   * Generate constraints from patterns and conservative defaults
   */
  private generateConstraints(patterns: ExtractedPatterns): ConstraintGuideline[] {
    const constraints: ConstraintGuideline[] = [];

    // Rate limits
    constraints.push({
      id: uuid(),
      name: 'LinkedIn Rate Limits',
      type: 'rate_limit',
      description: 'Daily limits for LinkedIn activity',
      config: {
        searches_per_day: 100,
        views_per_day: 500,
        connections_per_day: 100,
        messages_per_day: 150,
      },
      enforcement: 'hard',
    });

    constraints.push({
      id: uuid(),
      name: 'Email Rate Limits',
      type: 'rate_limit',
      description: 'Daily limits for email activity',
      config: {
        emails_per_day: 200,
        emails_per_candidate: 5,
      },
      enforcement: 'hard',
    });

    // Approval requirements (conservative start)
    constraints.push({
      id: uuid(),
      name: 'Initial Contact Approval',
      type: 'approval_required',
      description: 'First message to new candidate requires approval',
      config: {
        trigger: 'first_contact',
        approval_timeout_hours: 24,
      },
      enforcement: this.config.conservativeMode ? 'hard' : 'soft',
    });

    constraints.push({
      id: uuid(),
      name: 'Offer Discussion Approval',
      type: 'approval_required',
      description: 'Any compensation/offer discussion requires approval',
      config: {
        trigger: 'offer_discussion',
        keywords: ['salary', 'compensation', 'offer', 'benefits', 'equity'],
      },
      enforcement: 'hard',
    });

    // Quality thresholds
    constraints.push({
      id: uuid(),
      name: 'Minimum Fit Score',
      type: 'threshold',
      description: 'Candidates below this score require manual review',
      config: {
        metric: 'overall_fit_score',
        min_value: this.config.conservativeMode ? 0.7 : 0.6,
        action_if_below: 'escalate',
      },
      enforcement: 'soft',
    });

    return constraints;
  }

  // ===========================================================================
  // CRITERIA GENERATION
  // ===========================================================================

  private async generateCriteria(patterns: ExtractedPatterns): Promise<CriteriaContent> {
    const qualityStandards = this.generateQualityStandards(patterns);
    const evaluationRubrics = this.generateEvaluationRubrics(patterns);
    const failurePatterns = this.generateFailurePatterns(patterns);
    const successMetrics = this.generateSuccessMetrics();

    return {
      qualityStandards,
      evaluationRubrics,
      failurePatterns,
      successMetrics,
    };
  }

  /**
   * Generate quality standards from success factors
   */
  private generateQualityStandards(patterns: ExtractedPatterns): QualityStandard[] {
    const standards: QualityStandard[] = [];

    // Message quality standard
    standards.push({
      id: uuid(),
      name: 'Message Quality',
      description: 'Standards for outreach messages',
      dimensions: [
        {
          name: 'personalization',
          description: 'Message is personalized to candidate',
          weight: 0.3,
          minScore: 0.7,
        },
        {
          name: 'clarity',
          description: 'Message is clear and actionable',
          weight: 0.25,
          minScore: 0.8,
        },
        {
          name: 'tone',
          description: 'Tone matches brand voice',
          weight: 0.2,
          minScore: 0.7,
        },
        {
          name: 'grammar',
          description: 'No grammar or spelling errors',
          weight: 0.15,
          minScore: 0.95,
        },
        {
          name: 'length',
          description: 'Appropriate length for channel',
          weight: 0.1,
          minScore: 0.6,
        },
      ],
      threshold: this.config.conservativeMode ? 0.8 : 0.75,
    });

    // Screening quality standard
    standards.push({
      id: uuid(),
      name: 'Screening Quality',
      description: 'Standards for candidate evaluation',
      dimensions: [
        {
          name: 'completeness',
          description: 'All required factors evaluated',
          weight: 0.3,
          minScore: 0.9,
        },
        {
          name: 'accuracy',
          description: 'Information extracted correctly',
          weight: 0.3,
          minScore: 0.85,
        },
        {
          name: 'consistency',
          description: 'Similar candidates scored similarly',
          weight: 0.2,
          minScore: 0.8,
        },
        {
          name: 'justification',
          description: 'Scores are well-justified',
          weight: 0.2,
          minScore: 0.75,
        },
      ],
      threshold: 0.8,
    });

    // Add standards from success factors
    for (const factor of patterns.successFactors) {
      standards.push({
        id: uuid(),
        name: `${factor.category} Assessment`,
        description: `Standards for evaluating ${factor.category}`,
        dimensions: factor.factors.map((f) => ({
          name: f.name.toLowerCase().replace(/\s+/g, '_'),
          description: f.description,
          weight: f.weight,
          minScore: 0.6,
        })),
        threshold: 0.7,
      });
    }

    return standards;
  }

  /**
   * Generate evaluation rubrics
   */
  private generateEvaluationRubrics(patterns: ExtractedPatterns): EvaluationRubric[] {
    const rubrics: EvaluationRubric[] = [];

    // Resume evaluation rubric
    const roleSkills = patterns.roles.flatMap((r) => [
      ...r.requiredSkills.map((s) => s.skill),
      ...r.preferredSkills.map((s) => s.skill),
    ]);
    const uniqueSkills = [...new Set(roleSkills)].slice(0, 10);

    rubrics.push({
      id: uuid(),
      name: 'Resume Evaluation',
      taskType: 'screen_resume',
      dimensions: [
        {
          name: 'experience_match',
          description: 'Relevant experience for role',
          criteria: ['Has required years of experience', 'Experience in relevant domain', 'Progressive responsibility'],
          scoringGuide: {
            excellent: 'Exceeds requirements with directly relevant experience',
            good: 'Meets requirements with relevant experience',
            fair: 'Partially meets requirements',
            poor: 'Does not meet minimum requirements',
          },
          weight: 0.35,
        },
        {
          name: 'skills_match',
          description: 'Required and preferred skills',
          criteria: uniqueSkills.length > 0 ? uniqueSkills : ['Technical skills', 'Domain knowledge', 'Tools proficiency'],
          scoringGuide: {
            excellent: 'Has all required + most preferred skills',
            good: 'Has all required skills',
            fair: 'Has most required skills',
            poor: 'Missing critical skills',
          },
          weight: 0.35,
        },
        {
          name: 'education_match',
          description: 'Education requirements',
          criteria: ['Degree level', 'Field of study', 'Certifications'],
          scoringGuide: {
            excellent: 'Exceeds education requirements',
            good: 'Meets education requirements',
            fair: 'Close to requirements',
            poor: 'Does not meet requirements',
          },
          weight: 0.15,
        },
        {
          name: 'career_trajectory',
          description: 'Career progression and stability',
          criteria: ['Logical progression', 'Reasonable tenure', 'Growth pattern'],
          scoringGuide: {
            excellent: 'Clear upward trajectory with good tenure',
            good: 'Positive progression',
            fair: 'Mixed signals',
            poor: 'Concerning patterns',
          },
          weight: 0.15,
        },
      ],
    });

    // Message evaluation rubric
    rubrics.push({
      id: uuid(),
      name: 'Outreach Message Evaluation',
      taskType: 'send_outreach',
      dimensions: [
        {
          name: 'personalization',
          description: 'Tailored to specific candidate',
          criteria: ['References specific experience', 'Mentions relevant skills', 'Shows research'],
          scoringGuide: {
            excellent: 'Highly personalized with specific references',
            good: 'Personalized with some specifics',
            fair: 'Generic with light personalization',
            poor: 'Clearly templated/generic',
          },
          weight: 0.3,
        },
        {
          name: 'value_proposition',
          description: 'Clear reason to respond',
          criteria: ['Explains opportunity', 'Highlights benefits', 'Creates interest'],
          scoringGuide: {
            excellent: 'Compelling and specific value prop',
            good: 'Clear value proposition',
            fair: 'Vague value proposition',
            poor: 'No clear reason to respond',
          },
          weight: 0.25,
        },
        {
          name: 'call_to_action',
          description: 'Clear next step',
          criteria: ['Specific ask', 'Easy to respond', 'Appropriate urgency'],
          scoringGuide: {
            excellent: 'Clear, specific, and easy CTA',
            good: 'Clear CTA',
            fair: 'Vague CTA',
            poor: 'No CTA or confusing CTA',
          },
          weight: 0.2,
        },
        {
          name: 'professionalism',
          description: 'Tone and quality',
          criteria: ['Appropriate tone', 'No errors', 'Proper formatting'],
          scoringGuide: {
            excellent: 'Flawless and perfectly toned',
            good: 'Professional with minor issues',
            fair: 'Some tone or quality issues',
            poor: 'Unprofessional or error-filled',
          },
          weight: 0.25,
        },
      ],
    });

    return rubrics;
  }

  /**
   * Generate failure patterns from anti-patterns
   */
  private generateFailurePatterns(patterns: ExtractedPatterns): FailurePattern[] {
    const failures: FailurePattern[] = [];

    // Default failure patterns
    failures.push(
      {
        id: uuid(),
        name: 'Generic Message',
        description: 'Message lacks personalization',
        indicators: ['No candidate name', 'No specific skills mentioned', 'Obvious template'],
        severity: 'moderate',
        remediation: 'Add specific references to candidate profile and experience',
      },
      {
        id: uuid(),
        name: 'Salary Mention',
        description: 'Unprompted mention of salary/compensation',
        indicators: ['Contains salary', 'Discusses compensation', 'Mentions equity unprompted'],
        severity: 'high',
        remediation: 'Remove salary discussion, escalate if candidate asked',
      },
      {
        id: uuid(),
        name: 'Wrong Role Fit',
        description: 'Candidate clearly not qualified for role',
        indicators: ['Missing required skills', 'Insufficient experience', 'Wrong domain'],
        severity: 'high',
        remediation: 'Re-evaluate search criteria and scoring',
      },
      {
        id: uuid(),
        name: 'Aggressive Follow-up',
        description: 'Too frequent or pushy follow-ups',
        indicators: ['Multiple messages same day', 'Demanding language', 'Guilt-tripping'],
        severity: 'moderate',
        remediation: 'Respect timing constraints and soften tone',
      }
    );

    // Add from extracted anti-patterns
    for (const factor of patterns.successFactors) {
      for (const anti of factor.antiPatterns) {
        failures.push({
          id: uuid(),
          name: anti.name,
          description: anti.description,
          indicators: anti.redFlags,
          severity: anti.severity === 'disqualifier' ? 'critical' : anti.severity === 'concern' ? 'high' : 'moderate',
          remediation: `Address ${anti.name.toLowerCase()} issue`,
        });
      }
    }

    return failures;
  }

  /**
   * Generate success metrics
   */
  private generateSuccessMetrics(): CriteriaContent['successMetrics'] {
    return {
      responseRate: {
        target: 0.15,
        warning: 0.08,
        critical: 0.03,
      },
      qualifiedRate: {
        target: 0.4,
        warning: 0.25,
        critical: 0.1,
      },
      timeToResponse: {
        target: 48, // hours
        warning: 72,
        critical: 120,
      },
      candidateSatisfaction: {
        target: 4.0, // out of 5
        warning: 3.5,
        critical: 3.0,
      },
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private generateNotes(patterns: ExtractedPatterns): string[] {
    const notes: string[] = [];

    if (patterns.roles.length === 0) {
      notes.push('No role patterns extracted - using generic templates');
    }

    if (!patterns.brandVoice) {
      notes.push('No brand voice detected - using professional default');
    }

    if (patterns.communications.length === 0) {
      notes.push('No communication templates found - using defaults');
    }

    if (this.config.conservativeMode) {
      notes.push('Generated in conservative mode - high approval thresholds');
    }

    return notes;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let serviceInstance: BaselineGeneratorService | null = null;

export function getBaselineGeneratorService(
  config?: Partial<BaselineGeneratorConfig>
): BaselineGeneratorService {
  if (!serviceInstance) {
    serviceInstance = new BaselineGeneratorService(config);
  }
  return serviceInstance;
}
