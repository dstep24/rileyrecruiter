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
  // Traction signals (from guidelines)
  funding?: string;           // e.g., "$15M Series A from a16z"
  investors?: string[];       // e.g., ["a16z", "Sequoia"]
  arr?: string;               // e.g., "$25M ARR"
  growthRate?: string;        // e.g., "50% MoM"
  notableCustomers?: string[]; // e.g., ["Fortune 500 company"]
  // Team pedigree
  founderBackground?: string; // e.g., "Founding engineer at Figma"
  teamPedigree?: string[];    // e.g., ["Ex-Stripe", "Led 2 exits"]
  companyStage?: string;      // e.g., "Series A", "Seed", "Growth"
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

const OUTREACH_GENERATION_SYSTEM_PROMPT = `You are an expert technical recruiter writing personalized outreach messages that get responses.

## CORE PHILOSOPHY
Great outreach doesn't just list requirements or funding rounds. It tells a story, builds curiosity, and sells a real opportunity. Your goal is to write messages that make the candidate WANT to reply - not messages that sound like every other recruiter in their inbox.

## WHAT CONVERTS (High Response Rate)
✓ Strong, curiosity-driven subject lines (e.g., "Founding Engineer | $25M ARR in 3 Months | 15M a16z round")
✓ Make the candidate feel EXCLUSIVE ("You're one of the few engineers that made my shortlist")
✓ Underscore TEAM CREDIBILITY - startups pivot, candidates join TEAMS (founder pedigree, previous exits)
✓ Include TRACTION SIGNALS (ARR, growth rate, notable customers, funding from tier-1 VCs)
✓ Highlight why this role is DIFFERENT, not just what it is
✓ Leave the door open for other opportunities ("If this one's not a fit, let's still connect")
✓ Clear call to action - just ONE
✓ Reference SPECIFIC things from their profile (not generic "your background")

## WHAT DOESN'T CONVERT (Generic/Low Response Rate)
✗ Weak subject lines with no hook
✗ "Your background at [company] caught my eye" - generic opener
✗ "I came across your profile" - everyone says this
✗ Laundry list of requirements - how would that convince them to join?
✗ "Exciting opportunity" / "Perfect fit" - clichés
✗ "I hope this finds you well" - waste of precious characters
✗ Sounding like a mass-mail (no differentiation)
✗ Focusing only on the company, not on THEM
✗ Multiple CTAs - confusing

## MESSAGE STRUCTURE THAT WORKS

1. HOOK (Subject/Opening): Create curiosity with concrete numbers or exclusivity
   - "$25M ARR in 3 months" > "Fast-growing startup"
   - "You're one of 5 engineers on my shortlist" > "Great opportunity"

2. PERSONALIZATION: Reference SPECIFIC experience (not just company name)
   - "Your work scaling the payments team from 10 to 40 at Stripe" ✓
   - "Your background at Stripe caught my attention" ✗

3. WHY THIS IS DIFFERENT: Sell the opportunity, not the requirements
   - First engineering hire alongside proven founders
   - Massive traction signals (ARR, growth %)
   - Team pedigree (ex-Figma, multiple exits, etc.)

4. CALL TO ACTION: One clear, low-pressure ask
   - "Would you be open to a 15-minute chat?"
   - "Happy to share more details if interested"

5. LEAVE DOOR OPEN: If not a fit, keep the relationship
   - "Even if this role isn't right, I'd love to connect and share other opportunities"

## BRAND VOICE GUIDE
- professional: Formal, respectful, focuses on achievements
- professional-warm: Formal but approachable, conversational elements (RECOMMENDED)
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

  // Build traction signals section
  const tractionSignals: string[] = [];
  if (input.role.arr) tractionSignals.push(`ARR: ${input.role.arr}`);
  if (input.role.growthRate) tractionSignals.push(`Growth: ${input.role.growthRate}`);
  if (input.role.funding) tractionSignals.push(`Funding: ${input.role.funding}`);
  if (input.role.investors?.length) tractionSignals.push(`Investors: ${input.role.investors.join(', ')}`);
  if (input.role.notableCustomers?.length) tractionSignals.push(`Customers: ${input.role.notableCustomers.join(', ')}`);

  // Build team pedigree section
  const teamPedigree: string[] = [];
  if (input.role.founderBackground) teamPedigree.push(`Founder: ${input.role.founderBackground}`);
  if (input.role.teamPedigree?.length) teamPedigree.push(...input.role.teamPedigree);

  return `Write a ${channelName} to recruit ${input.candidate.name}.

## Character Limit
${charLimit} characters maximum for the message body.
${input.channel === 'linkedin_connection' ? 'This is VERY short - every word must count! Focus on ONE compelling hook.' : ''}

## Candidate Intelligence
Name: ${input.candidate.name}
Current Role: ${input.candidate.currentTitle || 'Unknown'} at ${input.candidate.currentCompany || 'Unknown'}
Location: ${input.candidate.location || 'Unknown'}
Headline: ${input.candidate.headline || 'N/A'}

### Experience (for personalization - reference SPECIFIC achievements)
${input.candidate.experience.slice(0, 3).map(exp =>
  `- ${exp.title} at ${exp.company} (${exp.duration})${exp.description ? `\n  ${exp.description.slice(0, 200)}...` : ''}`
).join('\n')}

### Skills
${input.candidate.skills.slice(0, 15).join(', ')}

${candidateHighlights.length > 0 ? `### Why They're a Good Fit (use this to personalize WHY)
${candidateHighlights.map(h => `- ${h}`).join('\n')}` : ''}

${suggestedApproach ? `### Suggested Approach\n${suggestedApproach}` : ''}

## The Opportunity
Role: ${input.role.title} at ${input.role.company}
${input.role.companyStage ? `Stage: ${input.role.companyStage}` : ''}
${input.role.location ? `Location: ${input.role.location}` : ''}
${input.role.remotePolicy ? `Remote Policy: ${input.role.remotePolicy}` : ''}
${input.role.teamSize ? `Team: ${input.role.teamSize}` : ''}
${input.role.techStack ? `Tech: ${input.role.techStack.join(', ')}` : ''}

${tractionSignals.length > 0 ? `### TRACTION SIGNALS (use these in subject line and message!)
${tractionSignals.map(s => `- ${s}`).join('\n')}` : ''}

${teamPedigree.length > 0 ? `### TEAM PEDIGREE (mention this - candidates join TEAMS)
${teamPedigree.map(p => `- ${p}`).join('\n')}` : ''}

### Why This Role is Different (not just requirements!)
${input.role.highlights.map(h => `- ${h}`).join('\n')}

${input.role.uniqueSelling ? `Unique Selling Point: ${input.role.uniqueSelling}` : ''}

${input.guidelines.includeCompensation && input.role.compensation ? `Compensation: ${input.role.compensation}` : ''}

## Brand Guidelines
Voice: ${input.guidelines.brandVoice}
Length Preference: ${input.guidelines.messageLength}
Call to Action: "${input.guidelines.callToAction}"
${input.guidelines.recruiterName ? `From: ${input.guidelines.recruiterName}${input.guidelines.recruiterTitle ? `, ${input.guidelines.recruiterTitle}` : ''}` : ''}

### Phrases to AVOID (these kill response rates)
${input.guidelines.avoidPhrases.map(p => `- "${p}"`).join('\n')}

## MESSAGE STRUCTURE REQUIREMENTS

1. SUBJECT LINE (for InMail/email): Must create CURIOSITY with specifics
   - Include traction signals or exclusivity hook
   - Example: "Founding Engineer | $25M ARR in 3 Months | 15M a16z round"

2. OPENING: Make them feel EXCLUSIVE, not mass-mailed
   - "You're one of the few engineers that made my shortlist for this"
   - Reference SPECIFIC experience, not just company name

3. BODY: Sell the OPPORTUNITY, not requirements
   - Lead with traction signals and team pedigree
   - Why is THIS role different from 20 other startups?

4. CLOSE: One clear CTA + keep the door open
   - "If this one's not a fit, let's still connect - I have access to many roles"

## Output Format (JSON only)

{
  ${input.channel !== 'linkedin_connection' ? '"subject": "<MUST include concrete numbers/signals - e.g., Founding Engineer | $25M ARR | a16z backed>",' : ''}
  "message": "<the full message body within ${charLimit} chars>",
  "greeting": "<just the greeting part>",
  "signoff": "<just the signature part>",
  "personalization": {
    "elements": ["<what SPECIFIC thing you referenced, e.g., 'Their Stripe payments team scaling from 10→40'>"],
    "reasoning": "<why these points make them feel special, not mass-mailed>"
  },
  "alternatives": [
    "<alternative message version 1 - different hook>",
    "<alternative message version 2 - different angle>"
  ],
  "followUpSequence": [
    {
      "dayOffset": 3,
      "subject": "<follow-up subject - new angle, not repeat>",
      "message": "<follow-up: add NEW value, not pushy, keep door open>",
      "trigger": "no_response"
    },
    {
      "dayOffset": 7,
      "message": "<final follow-up: brief, different angle, leave door open>",
      "trigger": "no_response"
    }
  ]
}

CRITICAL:
- Message MUST be under ${charLimit} characters!
- Subject line (if applicable) MUST include concrete numbers or signals
- Reference SPECIFIC candidate achievements, not generic "your background"
- Mention team pedigree/credibility - candidates join TEAMS
- Include ONE clear CTA and leave door open for other opportunities`;
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
    callToAction: 'Would you be open to a 15-minute chat this week?',
    avoidPhrases: [
      // Generic openers that kill response rates
      'exciting opportunity',
      'perfect fit',
      'I came across your profile',
      'I hope this finds you well',
      'Your background caught my eye',
      'I was impressed by your background',
      // Cliché recruiter speak
      'rockstar',
      'ninja',
      'guru',
      'unicorn',
      'fast-paced environment',
      'wear many hats',
      'hit the ground running',
      // Requirements dumps (don't list requirements - sell the role!)
      'Requirements:',
      'Must have:',
      'Required skills:',
      // Other low-converting phrases
      'Let me know if you are interested',
      'Feel free to reach out',
      'Don\'t hesitate to contact me',
    ],
    includeCompensation: false,
    recruiterName,
    recruiterTitle: 'Talent Partner',
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
