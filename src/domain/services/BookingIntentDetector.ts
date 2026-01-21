/**
 * Booking Intent Detector
 *
 * Analyzes candidate messages to detect interest in scheduling a call.
 * Uses pattern matching and AI for nuanced detection.
 *
 * Features:
 * - Pattern-based detection for common interest signals
 * - Confidence scoring
 * - Detection of questions about the role (engagement indicator)
 * - Support for both explicit and implicit intent
 */

import Anthropic from '@anthropic-ai/sdk';

// =============================================================================
// TYPES
// =============================================================================

export interface ConversationMessage {
  role: 'RILEY' | 'CANDIDATE' | 'TELEOPERATOR';
  content: string;
  createdAt?: Date;
}

export interface IntentDetectionResult {
  hasBookingIntent: boolean;
  confidence: number;  // 0-1
  signals: string[];   // What triggered detection
  suggestCalendly: boolean;  // Whether to include Calendly link
  reasoning?: string;  // AI reasoning if used
}

// Patterns that indicate interest/readiness to book
const STRONG_INTEREST_PATTERNS = [
  /\b(i'?m|i am)\s+(interested|intrigued|curious)/i,
  /\blet'?s\s+(schedule|set up|book|arrange)/i,
  /\bwhen\s+(can|could)\s+we\s+(talk|meet|chat|connect)/i,
  /\bwould\s+love\s+to\s+(chat|talk|learn|hear|discuss)/i,
  /\bsounds?\s+(great|good|interesting|exciting)/i,
  /\bopen\s+to\s+(discussing|talking|chatting|learning)/i,
  /\byes,?\s+(i'?d|i would)\s+(like|love|be interested)/i,
  /\bcount\s+me\s+in/i,
  /\bi'?m\s+(available|free)/i,
  /\bwhat'?s?\s+(your|the)\s+(availability|schedule)/i,
  /\bcan\s+(you|we)\s+share\s+(more|details)/i,
  /\btell\s+me\s+more/i,
];

// Patterns that indicate moderate interest (engagement but not explicitly ready)
const MODERATE_INTEREST_PATTERNS = [
  /\binteresting/i,
  /\bsounds?\s+like\s+a\s+good/i,
  /\bwhat'?s?\s+the\s+(role|position|opportunity)/i,
  /\bwho\s+is\s+the\s+(client|company)/i,
  /\bwhat'?s?\s+the\s+(salary|compensation|pay)/i,
  /\bis\s+(it|this)\s+(remote|hybrid|on-?site)/i,
  /\bwhere\s+is\s+(it|the\s+(role|position))\s+located/i,
  /\bcan\s+you\s+(tell|share|give)/i,
  /\bi'?d\s+like\s+to\s+(know|understand)/i,
  /\bhow\s+long\s+has\s+the\s+role\s+been\s+open/i,
];

// Patterns that indicate disinterest
const DISINTEREST_PATTERNS = [
  /\b(not|no)\s+(interested|thanks)/i,
  /\bpass\s+on\s+(this|that)/i,
  /\bnot\s+(looking|seeking)/i,
  /\bhappy\s+(where|at)\s+/i,
  /\bunsubscribe/i,
  /\bstop\s+(messaging|contacting)/i,
  /\bremove\s+(me|my)/i,
  /\bnot\s+a\s+(fit|match)/i,
];

// =============================================================================
// SERVICE
// =============================================================================

export class BookingIntentDetector {
  private anthropic: Anthropic;
  private useAIFallback: boolean;

  constructor(options?: { useAIFallback?: boolean }) {
    this.anthropic = new Anthropic();
    this.useAIFallback = options?.useAIFallback ?? true;
  }

  /**
   * Analyze candidate message to detect booking interest.
   */
  async detectIntent(
    message: string,
    conversationHistory: ConversationMessage[] = []
  ): Promise<IntentDetectionResult> {
    const signals: string[] = [];
    let confidence = 0;

    // Check for disinterest first
    const disinterestMatch = this.matchPatterns(message, DISINTEREST_PATTERNS);
    if (disinterestMatch) {
      return {
        hasBookingIntent: false,
        confidence: 0.9,
        signals: [`Disinterest detected: "${disinterestMatch}"`],
        suggestCalendly: false,
      };
    }

    // Check for strong interest patterns
    const strongMatches = this.findAllMatches(message, STRONG_INTEREST_PATTERNS);
    if (strongMatches.length > 0) {
      signals.push(...strongMatches.map(m => `Strong interest: "${m}"`));
      confidence += 0.4 + (strongMatches.length * 0.15); // Base 0.4, +0.15 per match
    }

    // Check for moderate interest patterns
    const moderateMatches = this.findAllMatches(message, MODERATE_INTEREST_PATTERNS);
    if (moderateMatches.length > 0) {
      signals.push(...moderateMatches.map(m => `Engagement: "${m}"`));
      confidence += 0.2 + (moderateMatches.length * 0.1); // Base 0.2, +0.1 per match
    }

    // Check conversation context
    const contextSignals = this.analyzeContext(message, conversationHistory);
    signals.push(...contextSignals.signals);
    confidence += contextSignals.confidenceBoost;

    // Check for questions (indicates engagement)
    if (message.includes('?') && moderateMatches.length > 0) {
      signals.push('Asking questions about the role');
      confidence += 0.1;
    }

    // Cap confidence at 1.0
    confidence = Math.min(confidence, 1.0);

    // If pattern matching is inconclusive and AI fallback is enabled
    if (confidence > 0.3 && confidence < 0.7 && this.useAIFallback) {
      const aiResult = await this.detectWithAI(message, conversationHistory);
      if (aiResult) {
        // Blend AI result with pattern result
        const blendedConfidence = (confidence + aiResult.confidence) / 2;
        return {
          hasBookingIntent: blendedConfidence > 0.5,
          confidence: blendedConfidence,
          signals: [...signals, ...aiResult.signals],
          suggestCalendly: blendedConfidence > 0.6,
          reasoning: aiResult.reasoning,
        };
      }
    }

    return {
      hasBookingIntent: confidence > 0.5,
      confidence,
      signals,
      suggestCalendly: confidence > 0.6,
    };
  }

  /**
   * Check if we should include Calendly link based on intent detection.
   */
  shouldIncludeCalendly(intent: IntentDetectionResult): boolean {
    return intent.suggestCalendly;
  }

  /**
   * Use AI to detect nuanced intent when pattern matching is inconclusive.
   */
  private async detectWithAI(
    message: string,
    conversationHistory: ConversationMessage[]
  ): Promise<IntentDetectionResult | null> {
    try {
      const contextMessages = conversationHistory
        .slice(-5) // Last 5 messages for context
        .map(m => `${m.role}: ${m.content}`)
        .join('\n');

      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 500,
        system: `You are an intent detection assistant for a recruiting platform. Analyze candidate messages to determine if they are interested in scheduling a call.

Return JSON with:
- hasBookingIntent: boolean (true if candidate seems interested in discussing/scheduling)
- confidence: number 0-1 (how confident you are)
- signals: string[] (what made you decide)
- reasoning: string (brief explanation)

Be generous with detection - if a candidate is asking questions about the role or seems engaged, that's a positive signal.`,
        messages: [
          {
            role: 'user',
            content: `Recent conversation:\n${contextMessages}\n\nLatest candidate message: "${message}"\n\nAnalyze the candidate's intent.`,
          },
        ],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        // Extract JSON from response
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          return {
            hasBookingIntent: result.hasBookingIntent,
            confidence: result.confidence,
            signals: result.signals || [],
            suggestCalendly: result.hasBookingIntent && result.confidence > 0.6,
            reasoning: result.reasoning,
          };
        }
      }
    } catch (error) {
      console.warn('[BookingIntentDetector] AI detection failed:', error);
    }

    return null;
  }

  /**
   * Find first matching pattern.
   */
  private matchPatterns(text: string, patterns: RegExp[]): string | null {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[0];
      }
    }
    return null;
  }

  /**
   * Find all matching patterns.
   */
  private findAllMatches(text: string, patterns: RegExp[]): string[] {
    const matches: string[] = [];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }
    return matches;
  }

  /**
   * Analyze conversation context for additional signals.
   */
  private analyzeContext(
    message: string,
    history: ConversationMessage[]
  ): { signals: string[]; confidenceBoost: number } {
    const signals: string[] = [];
    let confidenceBoost = 0;

    // Check if this is a response to a question from Riley
    if (history.length > 0) {
      const lastRileyMessage = [...history].reverse().find(m => m.role === 'RILEY');
      if (lastRileyMessage) {
        // If Riley asked about availability/interest and candidate responds positively
        const askedAboutInterest = /interested|available|schedule|call|chat/i.test(lastRileyMessage.content);
        const positiveResponse = /yes|sure|definitely|absolutely|sounds/i.test(message);

        if (askedAboutInterest && positiveResponse) {
          signals.push('Positive response to interest question');
          confidenceBoost += 0.2;
        }
      }
    }

    // Check message length - longer messages usually indicate more engagement
    if (message.length > 100) {
      signals.push('Detailed response indicates engagement');
      confidenceBoost += 0.1;
    }

    // Multiple sentences suggest thoughtful engagement
    const sentences = message.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length >= 3) {
      signals.push('Multi-sentence response');
      confidenceBoost += 0.05;
    }

    return { signals, confidenceBoost };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: BookingIntentDetector | null = null;

export function getBookingIntentDetector(): BookingIntentDetector {
  if (!instance) {
    instance = new BookingIntentDetector();
  }
  return instance;
}

export function resetBookingIntentDetector(): void {
  instance = null;
}

export const bookingIntentDetector = {
  get instance(): BookingIntentDetector {
    return getBookingIntentDetector();
  },
  detectIntent: (message: string, history?: ConversationMessage[]) =>
    getBookingIntentDetector().detectIntent(message, history),
  shouldIncludeCalendly: (intent: IntentDetectionResult) =>
    getBookingIntentDetector().shouldIncludeCalendly(intent),
};
