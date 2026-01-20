/**
 * Outreach Service - Candidate Communication & Engagement
 *
 * Handles personalized messaging, follow-up sequences, and nurturing campaigns.
 * Integrates with Guidelines for templates and Criteria for quality evaluation.
 *
 * Key Responsibilities:
 * - Generate personalized outreach messages
 * - Manage follow-up sequences
 * - Track response handling
 * - A/B test message variations
 * - Maintain brand voice consistency
 */

import { v4 as uuid } from 'uuid';
import { ClaudeClient, getClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import {
  GuidelinesManager,
  getGuidelinesManager,
} from '../../core/inner-loop/GuidelinesManager.js';
import {
  CriteriaEvaluator,
  getCriteriaEvaluator,
} from '../../core/inner-loop/CriteriaEvaluator.js';
import type {
  Candidate,
  JobRequisition,
  Guidelines,
  Criteria,
  Conversation,
} from '../../generated/prisma/index.js';
import type { CriteriaContent } from '../entities/Criteria.js';
import type { GeneratedOutput } from '../entities/InnerLoop.js';
import type { TemplateGuideline } from '../entities/Guidelines.js';

// =============================================================================
// TYPES
// =============================================================================

export interface OutreachMessage {
  id: string;
  conversationId?: string;
  candidateId: string;
  requisitionId: string;

  // Content
  channel: 'email' | 'linkedin' | 'sms';
  subject?: string; // For email
  body: string;
  signature?: string;

  // Personalization
  personalizationHooks: PersonalizationHook[];
  brandVoiceScore: number;

  // Sequence
  sequencePosition: number; // 1 = initial, 2 = follow-up 1, etc.
  sequenceId: string;
  scheduledFor?: Date;

  // Tracking
  status: 'draft' | 'pending_approval' | 'scheduled' | 'sent' | 'opened' | 'replied' | 'bounced';
  sentAt?: Date;
  openedAt?: Date;
  repliedAt?: Date;

  // Metadata
  templateId?: string;
  guidelinesVersion: number;
  generatedAt: Date;
}

export interface PersonalizationHook {
  type: 'name' | 'company' | 'role' | 'achievement' | 'skill' | 'connection' | 'custom';
  value: string;
  source: string; // Where this info came from
}

export interface OutreachSequence {
  id: string;
  tenantId: string;
  candidateId: string;
  requisitionId: string;

  // Configuration
  name: string;
  channel: 'email' | 'linkedin' | 'multi';
  maxTouches: number;
  daysBetweenTouches: number;

  // Status
  currentPosition: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;

  // Messages
  messages: OutreachMessage[];
}

export interface ResponseHandlingResult {
  conversationId: string;
  responseType:
    | 'positive' // Interested
    | 'negative' // Not interested
    | 'question' // Has questions
    | 'timing' // Not now, maybe later
    | 'referral' // Knows someone else
    | 'out_of_office' // Auto-reply
    | 'unclear'; // Needs interpretation

  sentiment: number; // -1 to 1
  suggestedAction: SuggestedAction;
  extractedInfo: Record<string, unknown>;
}

export interface SuggestedAction {
  type:
    | 'schedule_call'
    | 'send_follow_up'
    | 'answer_question'
    | 'remove_from_sequence'
    | 'pause_sequence'
    | 'escalate'
    | 'mark_referral';
  priority: 'high' | 'medium' | 'low';
  draftResponse?: string;
  reason: string;
}

export interface OutreachConfig {
  tenantId: string;
  guidelines: Guidelines;
  criteria: Criteria;
  senderName: string;
  senderTitle: string;
  companyName: string;
}

// =============================================================================
// OUTREACH SERVICE
// =============================================================================

export class OutreachService {
  private claude: ClaudeClient;
  private guidelinesManager: GuidelinesManager;
  private criteriaEvaluator: CriteriaEvaluator;

  constructor(
    claude?: ClaudeClient,
    guidelinesManager?: GuidelinesManager,
    criteriaEvaluator?: CriteriaEvaluator
  ) {
    this.claude = claude || getClaudeClient();
    this.guidelinesManager = guidelinesManager || getGuidelinesManager();
    this.criteriaEvaluator = criteriaEvaluator || getCriteriaEvaluator();
  }

  // ===========================================================================
  // MESSAGE GENERATION
  // ===========================================================================

  /**
   * Generate initial outreach message
   */
  async generateInitialOutreach(
    candidate: Candidate,
    requisition: JobRequisition,
    config: OutreachConfig,
    channel: 'email' | 'linkedin' = 'email'
  ): Promise<OutreachMessage> {
    // 1. Find appropriate template
    const template = await this.findBestTemplate(requisition, channel, 'initial', config.guidelines);

    // 2. Gather personalization data
    const personalizationHooks = await this.gatherPersonalizationHooks(candidate, requisition);

    // 3. Generate message using template + personalization
    const message = await this.generateMessage({
      candidate,
      requisition,
      template,
      personalizationHooks,
      config,
      channel,
      sequencePosition: 1,
    });

    // 4. Evaluate against Criteria
    const output: GeneratedOutput = {
      type: 'outreach',
      content: { body: message.body, subject: message.subject },
      metadata: {
        tokensUsed: 0,
        latencyMs: 0,
        modelId: 'evaluation',
      },
    };

    const criteriaContent = config.criteria as unknown as CriteriaContent;
    const evaluation = await this.criteriaEvaluator.evaluate(
      { output, taskType: 'outreach' },
      criteriaContent
    );

    // 5. Add brand voice score
    message.brandVoiceScore = evaluation.overallScore;

    return message;
  }

  /**
   * Generate follow-up message in sequence
   */
  async generateFollowUp(
    sequence: OutreachSequence,
    candidate: Candidate,
    requisition: JobRequisition,
    config: OutreachConfig
  ): Promise<OutreachMessage> {
    const position = sequence.currentPosition + 1;

    // Get previous messages for context
    const previousMessages = sequence.messages.slice(0, position - 1);

    // Find follow-up template
    const template = await this.findBestTemplate(
      requisition,
      sequence.channel === 'multi' ? 'email' : sequence.channel,
      `follow_up_${position}`,
      config.guidelines
    );

    // Gather hooks with awareness of previous touches
    const personalizationHooks = await this.gatherPersonalizationHooks(
      candidate,
      requisition,
      previousMessages
    );

    // Generate with follow-up context
    const message = await this.generateMessage({
      candidate,
      requisition,
      template,
      personalizationHooks,
      config,
      channel: sequence.channel === 'multi' ? 'email' : sequence.channel,
      sequencePosition: position,
      previousMessages,
    });

    return message;
  }

  private async generateMessage(params: {
    candidate: Candidate;
    requisition: JobRequisition;
    template: TemplateGuideline | null;
    personalizationHooks: PersonalizationHook[];
    config: OutreachConfig;
    channel: 'email' | 'linkedin';
    sequencePosition: number;
    previousMessages?: OutreachMessage[];
  }): Promise<OutreachMessage> {
    const {
      candidate,
      requisition,
      template,
      personalizationHooks,
      config,
      channel,
      sequencePosition,
      previousMessages,
    } = params;

    const prompt = this.buildGenerationPrompt({
      candidate,
      requisition,
      template,
      personalizationHooks,
      config,
      channel,
      sequencePosition,
      previousMessages,
    });

    const response = await this.claude.complete({
      prompt,
      system: this.getOutreachSystemPrompt(config),
      maxTokens: 1000,
    });

    const generated = JSON.parse(response.content);

    return {
      id: uuid(),
      candidateId: candidate.id,
      requisitionId: requisition.id,
      channel,
      subject: generated.subject,
      body: generated.body,
      signature: generated.signature,
      personalizationHooks,
      brandVoiceScore: 0, // Will be set after evaluation
      sequencePosition,
      sequenceId: uuid(),
      status: 'draft',
      templateId: template?.id,
      guidelinesVersion: (config.guidelines as unknown as { version: number }).version || 1,
      generatedAt: new Date(),
    };
  }

  private buildGenerationPrompt(params: {
    candidate: Candidate;
    requisition: JobRequisition;
    template: TemplateGuideline | null;
    personalizationHooks: PersonalizationHook[];
    config: OutreachConfig;
    channel: 'email' | 'linkedin';
    sequencePosition: number;
    previousMessages?: OutreachMessage[];
  }): string {
    const {
      candidate,
      requisition,
      template,
      personalizationHooks,
      config,
      channel,
      sequencePosition,
      previousMessages,
    } = params;

    let prompt = `Generate a ${channel} message for candidate outreach.

CANDIDATE:
- Name: ${candidate.firstName} ${candidate.lastName}
- Current Role: ${(candidate as unknown as { currentTitle?: string }).currentTitle || 'Unknown'}
- Company: ${(candidate as unknown as { currentCompany?: string }).currentCompany || 'Unknown'}

OPPORTUNITY:
- Role: ${requisition.title}
- Company: ${config.companyName}

SENDER:
- Name: ${config.senderName}
- Title: ${config.senderTitle}

PERSONALIZATION HOOKS:
${personalizationHooks.map((h) => `- ${h.type}: ${h.value} (from: ${h.source})`).join('\n')}
`;

    if (template) {
      prompt += `
TEMPLATE TO FOLLOW:
${template.body}
`;
    }

    if (previousMessages && previousMessages.length > 0) {
      prompt += `
PREVIOUS MESSAGES (no response yet):
${previousMessages.map((m, i) => `Message ${i + 1}: ${m.body.slice(0, 200)}...`).join('\n')}

This is follow-up #${sequencePosition}. Reference previous outreach subtly but don't be pushy.
`;
    }

    prompt += `
Return JSON:
{
  ${channel === 'email' ? '"subject": "Email subject line",' : ''}
  "body": "Full message body",
  "signature": "Closing signature"
}`;

    return prompt;
  }

  private getOutreachSystemPrompt(config: OutreachConfig): string {
    return `You are an expert recruiter writing outreach messages. Follow these guidelines:

1. PERSONALIZATION: Use specific details about the candidate to show you've done research
2. VALUE PROPOSITION: Clearly communicate why this opportunity is compelling
3. CALL TO ACTION: Include a clear, low-friction next step
4. TONE: Professional but warm, not salesy or desperate
5. LENGTH: Keep messages concise - respect the candidate's time
6. BRAND VOICE: Represent ${config.companyName} authentically

For follow-ups:
- Acknowledge previous message briefly
- Add new value or angle
- Don't guilt-trip for not responding
- Respect their time`;
  }

  // ===========================================================================
  // PERSONALIZATION
  // ===========================================================================

  private async gatherPersonalizationHooks(
    candidate: Candidate,
    requisition: JobRequisition,
    previousMessages?: OutreachMessage[]
  ): Promise<PersonalizationHook[]> {
    const hooks: PersonalizationHook[] = [];

    // Basic info
    hooks.push({
      type: 'name',
      value: candidate.firstName,
      source: 'candidate_profile',
    });

    const candidateExtended = candidate as unknown as {
      currentCompany?: string;
      currentTitle?: string;
      linkedinUrl?: string;
      skills?: string[];
    };

    if (candidateExtended.currentCompany) {
      hooks.push({
        type: 'company',
        value: candidateExtended.currentCompany,
        source: 'candidate_profile',
      });
    }

    if (candidateExtended.currentTitle) {
      hooks.push({
        type: 'role',
        value: candidateExtended.currentTitle,
        source: 'candidate_profile',
      });
    }

    // Try to find notable achievements or skills
    if (candidateExtended.skills && candidateExtended.skills.length > 0) {
      // Find skill overlap with requisition
      const reqSkills = (requisition as unknown as { skills?: string[] }).skills || [];
      const matchingSkills = candidateExtended.skills.filter((s) =>
        reqSkills.some((rs) => rs.toLowerCase().includes(s.toLowerCase()))
      );

      if (matchingSkills.length > 0) {
        hooks.push({
          type: 'skill',
          value: matchingSkills[0],
          source: 'skill_match',
        });
      }
    }

    // Could also scrape LinkedIn for recent posts, achievements, etc.
    // hooks.push(await this.scrapeLinkedInHooks(candidateExtended.linkedinUrl));

    return hooks;
  }

  // ===========================================================================
  // TEMPLATES
  // ===========================================================================

  private async findBestTemplate(
    requisition: JobRequisition,
    channel: 'email' | 'linkedin',
    purpose: string,
    guidelines: Guidelines
  ): Promise<TemplateGuideline | null> {
    // Query Guidelines for matching template
    const template = await this.guidelinesManager.findTemplate(
      guidelines,
      channel,
      purpose
    );

    if (!template) {
      console.warn(`[OutreachService] No template found for ${channel}/${purpose}`);
      return null;
    }

    return template;
  }

  // ===========================================================================
  // RESPONSE HANDLING
  // ===========================================================================

  /**
   * Analyze a candidate's response and suggest next action
   */
  async handleResponse(
    response: string,
    conversation: Conversation,
    config: OutreachConfig
  ): Promise<ResponseHandlingResult> {
    const prompt = `Analyze this candidate response and determine the appropriate action:

RESPONSE:
"${response}"

CONVERSATION CONTEXT:
- Messages exchanged: ${(conversation as unknown as { messageCount?: number }).messageCount || 'Unknown'}
- Last outreach type: ${(conversation as unknown as { lastMessageType?: string }).lastMessageType || 'Unknown'}

Classify the response and suggest action.

Return JSON:
{
  "responseType": "positive|negative|question|timing|referral|out_of_office|unclear",
  "sentiment": -1 to 1 (negative to positive),
  "suggestedAction": {
    "type": "schedule_call|send_follow_up|answer_question|remove_from_sequence|pause_sequence|escalate|mark_referral",
    "priority": "high|medium|low",
    "draftResponse": "Suggested reply if applicable",
    "reason": "Why this action"
  },
  "extractedInfo": {
    "availableTimes": ["if mentioned"],
    "referralName": "if mentioned",
    "questions": ["specific questions asked"],
    "concerns": ["any concerns raised"]
  }
}`;

    const result = await this.claude.complete({
      prompt,
      system: 'You are an expert recruiter analyzing candidate responses. Be accurate in classification.',
      maxTokens: 500,
    });

    const analysis = JSON.parse(result.content);

    return {
      conversationId: conversation.id,
      responseType: analysis.responseType,
      sentiment: analysis.sentiment,
      suggestedAction: analysis.suggestedAction,
      extractedInfo: analysis.extractedInfo,
    };
  }

  // ===========================================================================
  // SEQUENCE MANAGEMENT
  // ===========================================================================

  /**
   * Create a new outreach sequence for a candidate
   */
  async createSequence(
    candidate: Candidate,
    requisition: JobRequisition,
    config: OutreachConfig,
    options: {
      channel?: 'email' | 'linkedin' | 'multi';
      maxTouches?: number;
      daysBetweenTouches?: number;
    } = {}
  ): Promise<OutreachSequence> {
    const {
      channel = 'email',
      maxTouches = 4,
      daysBetweenTouches = 3,
    } = options;

    // Generate initial message
    const initialMessage = await this.generateInitialOutreach(
      candidate,
      requisition,
      config,
      channel === 'multi' ? 'email' : channel
    );

    const sequence: OutreachSequence = {
      id: uuid(),
      tenantId: config.tenantId,
      candidateId: candidate.id,
      requisitionId: requisition.id,
      name: `${requisition.title} Outreach - ${candidate.firstName} ${candidate.lastName}`,
      channel,
      maxTouches,
      daysBetweenTouches,
      currentPosition: 1,
      status: 'active',
      startedAt: new Date(),
      messages: [initialMessage],
    };

    return sequence;
  }

  /**
   * Advance sequence to next step
   */
  async advanceSequence(
    sequence: OutreachSequence,
    candidate: Candidate,
    requisition: JobRequisition,
    config: OutreachConfig
  ): Promise<OutreachSequence | null> {
    if (sequence.currentPosition >= sequence.maxTouches) {
      // Sequence completed
      return {
        ...sequence,
        status: 'completed',
        completedAt: new Date(),
      };
    }

    // Generate next follow-up
    const nextMessage = await this.generateFollowUp(sequence, candidate, requisition, config);

    return {
      ...sequence,
      currentPosition: sequence.currentPosition + 1,
      messages: [...sequence.messages, nextMessage],
    };
  }

  // ===========================================================================
  // A/B TESTING
  // ===========================================================================

  /**
   * Generate message variations for A/B testing
   */
  async generateVariations(
    candidate: Candidate,
    requisition: JobRequisition,
    config: OutreachConfig,
    count: number = 2
  ): Promise<OutreachMessage[]> {
    const variations: OutreachMessage[] = [];

    for (let i = 0; i < count; i++) {
      const variation = await this.generateInitialOutreach(
        candidate,
        requisition,
        {
          ...config,
          // Vary the approach
          guidelines: config.guidelines,
        }
      );
      variation.id = uuid(); // Unique ID for each variation
      variations.push(variation);
    }

    return variations;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: OutreachService | null = null;

export function getOutreachService(): OutreachService {
  if (!instance) {
    instance = new OutreachService();
  }
  return instance;
}

export function resetOutreachService(): void {
  instance = null;
}
