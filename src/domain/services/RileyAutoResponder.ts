/**
 * Riley Auto-Responder Service
 *
 * Generates AI-powered responses for Riley-initiated LinkedIn conversations.
 * Uses Claude to generate contextual, professional responses aimed at
 * booking candidates for recruiter calls.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { RileyConversation, RileyMessage, RileyConversationStage } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AutoResponseContext {
  conversation: RileyConversation & { messages: RileyMessage[] };
  incomingMessage: string;
  candidateProfile?: {
    headline?: string;
    summary?: string;
    experiences?: Array<{
      title: string;
      company: string;
      duration?: string;
    }>;
  };
}

export interface AutoResponseResult {
  message: string;
  confidence: number;
  reasoning: string;
  suggestedStage?: RileyConversationStage;
  shouldEscalate: boolean;
  escalationReason?: string;
}

// =============================================================================
// ESCALATION PATTERNS
// =============================================================================

const ESCALATION_PATTERNS = [
  // Compensation discussions
  { pattern: /salary|compensation|pay|offer|package|equity|stock|bonus|money/i, reason: 'Compensation discussion' },
  // Scheduling requests
  { pattern: /schedule|interview|meet|call|availability|calendar|book|zoom|teams/i, reason: 'Scheduling request' },
  // Opt-out requests
  { pattern: /not interested|no thanks|stop|unsubscribe|remove me|don'?t contact/i, reason: 'Opt-out request' },
  // Visa/legal topics
  { pattern: /visa|sponsor|work authorization|h1b|green card|legal/i, reason: 'Immigration/visa topic' },
  // Identity questions
  { pattern: /who are you|are you a bot|are you real|are you human|ai|automated/i, reason: 'Identity question' },
  // Complaints
  { pattern: /complaint|upset|angry|frustrated|annoyed|rude|inappropriate/i, reason: 'Candidate complaint' },
];

// =============================================================================
// SERVICE
// =============================================================================

export class RileyAutoResponder {
  private client: Anthropic | null = null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Check if a message should trigger escalation before generating a response.
   */
  checkForEscalation(message: string): { shouldEscalate: boolean; reason?: string } {
    for (const { pattern, reason } of ESCALATION_PATTERNS) {
      if (pattern.test(message)) {
        return { shouldEscalate: true, reason };
      }
    }

    // Check message length
    if (message.length < 5) {
      return { shouldEscalate: true, reason: 'Message too short to interpret' };
    }
    if (message.length > 1000) {
      return { shouldEscalate: true, reason: 'Long message requiring careful review' };
    }

    return { shouldEscalate: false };
  }

  /**
   * Generate an AI-powered response to a candidate message.
   */
  async generateResponse(context: AutoResponseContext): Promise<AutoResponseResult> {
    const { conversation, incomingMessage, candidateProfile } = context;

    // Check for escalation triggers first
    const escalationCheck = this.checkForEscalation(incomingMessage);
    if (escalationCheck.shouldEscalate) {
      return {
        message: '',
        confidence: 0,
        reasoning: `Escalation triggered: ${escalationCheck.reason}`,
        shouldEscalate: true,
        escalationReason: escalationCheck.reason,
      };
    }

    // If no API key, escalate
    if (!this.client) {
      return {
        message: '',
        confidence: 0,
        reasoning: 'No Anthropic API key configured',
        shouldEscalate: true,
        escalationReason: 'API key not configured - cannot generate response',
      };
    }

    try {
      const systemPrompt = this.buildSystemPrompt(conversation);
      const userPrompt = this.buildUserPrompt(context);

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const textContent = response.content.find(block => block.type === 'text');
      const responseText = textContent ? (textContent as { type: 'text'; text: string }).text : '';

      // Parse JSON response
      try {
        const parsed = JSON.parse(responseText);

        // If AI decided to escalate, respect that
        if (parsed.escalate || parsed.shouldEscalate) {
          return {
            message: '',
            confidence: 0,
            reasoning: parsed.reasoning || 'AI determined escalation needed',
            shouldEscalate: true,
            escalationReason: parsed.reason || parsed.escalationReason || 'AI escalation',
          };
        }

        return {
          message: parsed.message || '',
          confidence: parsed.confidence || 0.7,
          reasoning: parsed.reasoning || 'Generated AI response',
          suggestedStage: this.mapStage(parsed.stage),
          shouldEscalate: false,
        };
      } catch {
        // Not JSON, treat as plain message
        return {
          message: responseText.trim(),
          confidence: 0.6,
          reasoning: 'Generated plain text response',
          shouldEscalate: false,
        };
      }
    } catch (error) {
      console.error('[RileyAutoResponder] Error generating response:', error);
      return {
        message: '',
        confidence: 0,
        reasoning: error instanceof Error ? error.message : 'Unknown error',
        shouldEscalate: true,
        escalationReason: 'Failed to generate AI response',
      };
    }
  }

  /**
   * Build the system prompt for Riley's personality.
   */
  private buildSystemPrompt(conversation: RileyConversation): string {
    return `You are Riley, a friendly and knowledgeable technical recruiter having a LinkedIn conversation with ${conversation.candidateName || 'a candidate'}.

## Your Goal
Your primary goal is to:
1. Build rapport and answer their questions naturally
2. Gauge their interest in the ${conversation.jobTitle || 'role'} opportunity
3. If they're interested, guide the conversation toward scheduling a call with the hiring team

## Your Style
- Professional but warm and conversational
- Concise (2-4 sentences max per message)
- Natural LinkedIn messaging tone, not corporate speak
- Knowledgeable about technology (you have an engineering background)
- Respectful of their time

## Important Rules
1. NEVER discuss specific salary, compensation, or equity numbers
2. NEVER make scheduling commitments (say you'll have someone reach out)
3. If they seem uninterested, acknowledge gracefully and don't push
4. If you're unsure how to respond, escalate rather than guess
5. Don't be salesy - be genuinely helpful

## When to Escalate
Return {"escalate": true, "reason": "..."} instead of a message when:
- They ask about salary, compensation, or benefits specifics
- They want to schedule an interview or call
- They ask if you're a bot or express concern about automation
- They complain or express frustration
- You're genuinely unsure how to respond appropriately

## Output Format
Respond with JSON:
{
  "message": "Your response to the candidate",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation",
  "stage": "IN_CONVERSATION" or "SCHEDULING"
}

OR for escalation:
{
  "escalate": true,
  "reason": "Why this needs human attention",
  "reasoning": "Brief explanation"
}`;
  }

  /**
   * Build the user prompt with conversation context.
   */
  private buildUserPrompt(context: AutoResponseContext): string {
    const { conversation, incomingMessage, candidateProfile } = context;

    let prompt = `## Current Conversation\n`;
    prompt += `Candidate: ${conversation.candidateName || 'Unknown'}\n`;
    if (conversation.candidateTitle) prompt += `Title: ${conversation.candidateTitle}\n`;
    if (conversation.candidateCompany) prompt += `Company: ${conversation.candidateCompany}\n`;
    prompt += `Role discussing: ${conversation.jobTitle || 'Engineering role'}\n`;
    prompt += `Conversation stage: ${conversation.stage}\n`;
    prompt += `Messages so far: ${conversation.messageCount}\n\n`;

    // Add candidate background if available
    if (candidateProfile?.summary) {
      prompt += `## Candidate Background\n`;
      prompt += `${candidateProfile.summary.substring(0, 300)}...\n\n`;
    }

    // Add message history
    if (conversation.messages && conversation.messages.length > 0) {
      prompt += `## Message History\n`;
      // Show last 5 messages for context
      const recentMessages = conversation.messages.slice(-5);
      for (const msg of recentMessages) {
        const sender = msg.role === 'RILEY' ? 'Riley' : msg.role === 'CANDIDATE' ? conversation.candidateName : 'Recruiter';
        prompt += `${sender}: ${msg.content}\n\n`;
      }
    }

    prompt += `## New Message from ${conversation.candidateName || 'Candidate'}\n`;
    prompt += `"${incomingMessage}"\n\n`;
    prompt += `Generate your response as JSON.`;

    return prompt;
  }

  /**
   * Map AI stage suggestion to Prisma enum.
   */
  private mapStage(stage?: string): RileyConversationStage | undefined {
    if (!stage) return undefined;

    const stageMap: Record<string, RileyConversationStage> = {
      'IN_CONVERSATION': 'IN_CONVERSATION',
      'in_conversation': 'IN_CONVERSATION',
      'SCHEDULING': 'SCHEDULING',
      'scheduling': 'SCHEDULING',
      'CLOSED_INTERESTED': 'CLOSED_INTERESTED',
      'closed_interested': 'CLOSED_INTERESTED',
      'CLOSED_NOT_INTERESTED': 'CLOSED_NOT_INTERESTED',
      'closed_not_interested': 'CLOSED_NOT_INTERESTED',
    };

    return stageMap[stage];
  }
}

// Export singleton instance
export const rileyAutoResponder = new RileyAutoResponder();
