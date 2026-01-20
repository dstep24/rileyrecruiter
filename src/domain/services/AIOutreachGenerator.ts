/**
 * AI Outreach Generator
 *
 * Creates personalized, compelling recruiting messages for each candidate using Claude.
 * This solves the problem of generic mass-mail messages with low response rates
 * by generating messages that reference specific candidate achievements and experience.
 *
 * Key capabilities:
 * - Personalization from candidate profile
 * - Brand voice matching
 * - Channel-specific formatting (LinkedIn connection, InMail, email)
 * - Follow-up sequence generation
 * - A/B test variations
 */

import { getClaudeClient, ClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type { CandidateScore, CandidateProfile } from './AICandidateScorer.js';

// =============================================================================
// TYPES
// =============================================================================

export interface OutreachInput {
  candidate: CandidateProfile;
  candidateScore?: CandidateScore;
  role: RoleInfo;
  guidelines: OutreachGuidelines;
  channel: OutreachChannel;
}

export interface RoleInfo {
  title: string;
  company: string;
  highlights: string[];
  compensation?: string;
  location?: string;
  remotePolicy?: string;
  teamSize?: string;
  techStack?: string[];
  uniqueSelling?: string;
}

export interface OutreachGuidelines {
  brandVoice: BrandVoice;
  messageLength: 'short' | 'medium' | 'long';
  callToAction: string;
  avoidPhrases: string[];
  includeCompensation: boolean;
  recruiterName?: string;
  recruiterTitle?: string;
  companyAbout?: string;
}

export type BrandVoice =
  | 'professional'
  | 'professional-warm'
  | 'casual-friendly'
  | 'technical-peer'
  | 'executive';

export type OutreachChannel =
  | 'linkedin_connection'
  | 'linkedin_inmail'
  | 'email';

export interface GeneratedOutreach {
  subject?: string;           // For InMail/email
  message: string;
  greeting: string;
  signoff: string;

  personalization: {
    elements: string[];
    reasoning: string;
  };

  alternatives: string[];     // 2 alternative versions

  followUpSequence?: FollowUpMessage[];

  metadata: {
    channel: OutreachChannel;
    charCount: number;
    withinLimit: boolean;
    generatedAt: Date;
  };
}

export interface FollowUpMessage {
  dayOffset: number;
  subject?: string;
  message: string;
  trigger?: 'no_response' | 'viewed_profile' | 'connected';
}

// =============================================================================
// CHANNEL LIMITS
// =============================================================================

const CHANNEL_LIMITS = {
  linkedin_connection: 300,   // Connection request note limit
  linkedin_inmail: 1900,      // InMail character limit
  email: 5000,                // Reasonable email limit
};

// =============================================================================
// PROMPTS
// =============================================================================

const OUTREACH_GENERATION_SYSTEM_PROMPT = `You are an expert technical recruiter writing personalized outreach messages.

Your job is to write messages that feel genuinely personalized - like they were written by someone who actually read the candidate's profile, not a mass-mail tool.

KEY PRINCIPLES:
1. Lead with THEM, not the opportunity
2. Reference SPECIFIC things from their background
3. Connect their experience to WHY they'd excel in this role
4. Keep it conversational, not corporate
5. End with a low-pressure call to action

WHAT MAKES MESSAGES WORK:
- "I noticed you scaled the payments team at Stripe from 10 to 40 engineers" ✓
- "Your experience leading ML infrastructure at Scale AI caught my attention" ✓
- "I was impressed by your background" ✗ (generic)
- "I came across your profile" ✗ (everyone says this)

AVOID:
- "Exciting opportunity" - cliché
- "Perfect fit" - overused
- "I hope this message finds you well" - waste of characters
- Starting with "Hi [Name]!" - too casual/generic
- Long company descriptions - candidate can look it up
- Multiple CTAs - pick one

BRAND VOICE GUIDE:
- professional: Formal, respectful, focuses on achievements
- professional-warm: Formal but approachable, conversational elements
- casual-friendly: Relaxed, peer-to-peer tone, some humor okay
- technical-peer: Developer-to-developer, references tech specifics
- executive: Concise, strategic, focuses on impact and leadership

Output valid JSON only - no markdown, no explanation outside the JSON.`;

function buildOutreachPrompt(input: OutreachInput): string {
  const charLimit = CHANNEL_LIMITS[input.channel];
  const channelName = {
    linkedin_connection: 'LinkedIn connection request',
    linkedin_inmail: 'LinkedIn InMail',
    email: 'Email',
  }[input.channel];

  const candidateHighlights = input.candidateScore?.highlights || [];
  const suggestedApproach = input.candidateScore?.suggestedApproach || '';

  return `Write a ${channelName} to recruit ${input.candidate.name}.

## Character Limit
${charLimit} characters maximum for the message body.
${input.channel === 'linkedin_connection' ? 'This is VERY short - every word must count!' : ''}

## Candidate Intelligence
Name: ${input.candidate.name}
Current Role: ${input.candidate.currentTitle || 'Unknown'} at ${input.candidate.currentCompany || 'Unknown'}
Location: ${input.candidate.location || 'Unknown'}
Headline: ${input.candidate.headline || 'N/A'}

### Experience Highlights
${input.candidate.experience.slice(0, 3).map(exp =>
  `- ${exp.title} at ${exp.company} (${exp.duration})${exp.description ? `\n  ${exp.description.slice(0, 200)}...` : ''}`
).join('\n')}

### Skills
${input.candidate.skills.slice(0, 15).join(', ')}

${candidateHighlights.length > 0 ? `### Why They're a Good Fit
${candidateHighlights.map(h => `- ${h}`).join('\n')}` : ''}

${suggestedApproach ? `### Suggested Approach\n${suggestedApproach}` : ''}

## The Opportunity
Role: ${input.role.title} at ${input.role.company}
${input.role.location ? `Location: ${input.role.location}` : ''}
${input.role.remotePolicy ? `Remote Policy: ${input.role.remotePolicy}` : ''}
${input.role.teamSize ? `Team: ${input.role.teamSize}` : ''}
${input.role.techStack ? `Tech: ${input.role.techStack.join(', ')}` : ''}

### Why This Role is Compelling
${input.role.highlights.map(h => `- ${h}`).join('\n')}

${input.role.uniqueSelling ? `Unique Selling Point: ${input.role.uniqueSelling}` : ''}

${input.guidelines.includeCompensation && input.role.compensation ? `Compensation: ${input.role.compensation}` : ''}

## Brand Guidelines
Voice: ${input.guidelines.brandVoice}
Length Preference: ${input.guidelines.messageLength}
Call to Action: "${input.guidelines.callToAction}"
${input.guidelines.recruiterName ? `From: ${input.guidelines.recruiterName}${input.guidelines.recruiterTitle ? `, ${input.guidelines.recruiterTitle}` : ''}` : ''}

### Phrases to AVOID
${input.guidelines.avoidPhrases.map(p => `- "${p}"`).join('\n')}

## Output Format (JSON only)

{
  ${input.channel !== 'linkedin_connection' ? '"subject": "<compelling subject line>",' : ''}
  "message": "<the full message body within ${charLimit} chars>",
  "greeting": "<just the greeting part>",
  "signoff": "<just the signature part>",
  "personalization": {
    "elements": ["<what you personalized, e.g., 'Referenced their Stripe scaling work'>"],
    "reasoning": "<why you chose these personalization points>"
  },
  "alternatives": [
    "<alternative message version 1>",
    "<alternative message version 2>"
  ],
  "followUpSequence": [
    {
      "dayOffset": 3,
      "subject": "<follow-up subject>",
      "message": "<follow-up message if no response>",
      "trigger": "no_response"
    },
    {
      "dayOffset": 7,
      "message": "<second follow-up>",
      "trigger": "no_response"
    }
  ]
}

REMEMBER: The message MUST be under ${charLimit} characters!`;
}

// =============================================================================
// AI OUTREACH GENERATOR CLASS
// =============================================================================

export class AIOutreachGenerator {
  private claudeClient: ClaudeClient;

  constructor(claudeClient?: ClaudeClient) {
    this.claudeClient = claudeClient || getClaudeClient();
  }

  /**
   * Generate a personalized outreach message
   */
  async generateOutreach(input: OutreachInput): Promise<GeneratedOutreach> {
    const prompt = buildOutreachPrompt(input);

    const response = await this.claudeClient.chat({
      systemPrompt: OUTREACH_GENERATION_SYSTEM_PROMPT,
      prompt,
      temperature: 0.7,  // Higher for more creative messages
      maxTokens: 2048,
    });

    const parsed = this.claudeClient.parseJsonResponse<{
      subject?: string;
      message: string;
      greeting?: string;
      signoff?: string;
      personalization?: { elements: string[]; reasoning: string };
      alternatives?: string[];
      followUpSequence?: FollowUpMessage[];
    }>(response);

    const charLimit = CHANNEL_LIMITS[input.channel];

    return {
      subject: parsed.subject,
      message: parsed.message,
      greeting: parsed.greeting || this.defaultGreeting(input.candidate.name, input.guidelines.brandVoice),
      signoff: parsed.signoff || this.defaultSignoff(input.guidelines),
      personalization: parsed.personalization || { elements: [], reasoning: '' },
      alternatives: parsed.alternatives || [],
      followUpSequence: parsed.followUpSequence,
      metadata: {
        channel: input.channel,
        charCount: parsed.message.length,
        withinLimit: parsed.message.length <= charLimit,
        generatedAt: new Date(),
      },
    };
  }

  /**
   * Generate outreach for multiple candidates (batch)
   */
  async generateBatchOutreach(
    candidates: Array<{ candidate: CandidateProfile; score?: CandidateScore }>,
    role: RoleInfo,
    guidelines: OutreachGuidelines,
    channel: OutreachChannel
  ): Promise<Map<string, GeneratedOutreach>> {
    const results = new Map<string, GeneratedOutreach>();

    // Process in parallel batches of 3
    const batchSize = 3;
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      const batchPromises = batch.map(({ candidate, score }) =>
        this.generateOutreach({
          candidate,
          candidateScore: score,
          role,
          guidelines,
          channel,
        }).catch(error => {
          console.error(`Error generating outreach for ${candidate.id}:`, error);
          return null;
        })
      );

      const batchResults = await Promise.all(batchPromises);
      batchResults.forEach((result, idx) => {
        if (result) {
          results.set(batch[idx].candidate.id, result);
        }
      });
    }

    return results;
  }

  /**
   * Generate a quick follow-up message
   */
  async generateFollowUp(
    candidate: CandidateProfile,
    originalMessage: string,
    daysSinceOriginal: number,
    guidelines: OutreachGuidelines,
    channel: OutreachChannel
  ): Promise<string> {
    const prompt = `Write a brief follow-up message for ${candidate.name}.

Original message sent ${daysSinceOriginal} days ago:
${originalMessage}

Guidelines:
- Keep it SHORT (under 100 chars for connection, under 300 for InMail)
- Don't repeat the original pitch
- Add new value or angle
- Light, not pushy
- Brand voice: ${guidelines.brandVoice}

Return JSON: { "message": "<follow-up message>" }`;

    const response = await this.claudeClient.chat({
      systemPrompt: 'You write brief, non-pushy follow-up messages.',
      prompt,
      temperature: 0.6,
      maxTokens: 512,
    });

    const parsed = this.claudeClient.parseJsonResponse<{ message: string }>(response);
    return parsed.message;
  }

  /**
   * Regenerate a message with specific feedback
   */
  async regenerateWithFeedback(
    input: OutreachInput,
    originalMessage: string,
    feedback: string
  ): Promise<GeneratedOutreach> {
    const basePrompt = buildOutreachPrompt(input);
    const feedbackPrompt = `${basePrompt}

## Feedback on Previous Version
Previous message:
${originalMessage}

Feedback to address:
${feedback}

Generate an improved version that addresses this feedback.`;

    const response = await this.claudeClient.chat({
      systemPrompt: OUTREACH_GENERATION_SYSTEM_PROMPT,
      prompt: feedbackPrompt,
      temperature: 0.7,
      maxTokens: 2048,
    });

    const parsed = this.claudeClient.parseJsonResponse<{
      subject?: string;
      message: string;
      greeting?: string;
      signoff?: string;
      personalization?: { elements: string[]; reasoning: string };
      alternatives?: string[];
      followUpSequence?: FollowUpMessage[];
    }>(response);

    const charLimit = CHANNEL_LIMITS[input.channel];

    return {
      subject: parsed.subject,
      message: parsed.message,
      greeting: parsed.greeting || this.defaultGreeting(input.candidate.name, input.guidelines.brandVoice),
      signoff: parsed.signoff || this.defaultSignoff(input.guidelines),
      personalization: parsed.personalization || { elements: [], reasoning: '' },
      alternatives: parsed.alternatives || [],
      followUpSequence: parsed.followUpSequence,
      metadata: {
        channel: input.channel,
        charCount: parsed.message.length,
        withinLimit: parsed.message.length <= charLimit,
        generatedAt: new Date(),
      },
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private defaultGreeting(name: string, voice: BrandVoice): string {
    const firstName = name.split(' ')[0];
    switch (voice) {
      case 'professional':
        return `Dear ${firstName},`;
      case 'professional-warm':
        return `Hi ${firstName},`;
      case 'casual-friendly':
        return `Hey ${firstName}!`;
      case 'technical-peer':
        return `Hi ${firstName},`;
      case 'executive':
        return `${firstName},`;
      default:
        return `Hi ${firstName},`;
    }
  }

  private defaultSignoff(guidelines: OutreachGuidelines): string {
    const name = guidelines.recruiterName || 'The Recruiting Team';
    switch (guidelines.brandVoice) {
      case 'professional':
        return `Best regards,\n${name}`;
      case 'professional-warm':
        return `Best,\n${name}`;
      case 'casual-friendly':
        return `Cheers,\n${name}`;
      case 'technical-peer':
        return `- ${name}`;
      case 'executive':
        return `${name}`;
      default:
        return `Best,\n${name}`;
    }
  }
}

// =============================================================================
// FACTORY
// =============================================================================

let generatorInstance: AIOutreachGenerator | null = null;

export function getAIOutreachGenerator(): AIOutreachGenerator {
  if (!generatorInstance) {
    generatorInstance = new AIOutreachGenerator();
  }
  return generatorInstance;
}

export function resetAIOutreachGenerator(): void {
  generatorInstance = null;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create default outreach guidelines
 */
export function createDefaultGuidelines(
  recruiterName?: string,
  companyName?: string
): OutreachGuidelines {
  return {
    brandVoice: 'professional-warm',
    messageLength: 'medium',
    callToAction: 'Would you be open to a quick chat?',
    avoidPhrases: [
      'exciting opportunity',
      'perfect fit',
      'I came across your profile',
      'I hope this finds you well',
      'rockstar',
      'ninja',
      'guru',
    ],
    includeCompensation: false,
    recruiterName,
    recruiterTitle: 'Recruiter',
    companyAbout: companyName ? `${companyName} is a growing company.` : undefined,
  };
}

/**
 * Validate message length against channel limits
 */
export function validateMessageLength(
  message: string,
  channel: OutreachChannel
): { valid: boolean; charCount: number; limit: number; overBy: number } {
  const limit = CHANNEL_LIMITS[channel];
  const charCount = message.length;
  const overBy = Math.max(0, charCount - limit);

  return {
    valid: charCount <= limit,
    charCount,
    limit,
    overBy,
  };
}

/**
 * Truncate message to fit channel limit while preserving structure
 */
export function truncateMessage(
  message: string,
  channel: OutreachChannel
): string {
  const limit = CHANNEL_LIMITS[channel];
  if (message.length <= limit) return message;

  // Try to truncate at a sentence boundary
  const truncated = message.slice(0, limit - 3);
  const lastSentence = truncated.lastIndexOf('. ');
  const lastQuestion = truncated.lastIndexOf('? ');
  const lastBreak = Math.max(lastSentence, lastQuestion);

  if (lastBreak > limit * 0.7) {
    return message.slice(0, lastBreak + 1);
  }

  return truncated + '...';
}
