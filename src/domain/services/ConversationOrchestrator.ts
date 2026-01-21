/**
 * Conversation Orchestrator
 *
 * The main coordinator for the messaging queue to calendar booking flow.
 * Ties together:
 * - RileyAutoResponder: AI response generation
 * - BookingIntentDetector: Detecting when candidate is ready to book
 * - CalendlyRotatorService: Round-robin link assignment
 * - OutreachSettingsService: Configuration
 *
 * Handles:
 * - Incoming candidate messages (via webhook)
 * - Follow-up generation for no-response scenarios
 * - Calendly link insertion when booking intent detected
 * - Escalation keyword detection
 */

import {
  RileyAutoResponder,
  rileyAutoResponder,
  AutoResponseContext,
} from './RileyAutoResponder.js';
import {
  BookingIntentDetector,
  getBookingIntentDetector,
  ConversationMessage,
} from './BookingIntentDetector.js';
import {
  CalendlyRotatorService,
  getCalendlyRotatorService,
} from './CalendlyRotatorService.js';
import { getOutreachSettingsService, OutreachSettings } from './OutreachSettingsService.js';
import { AIOutreachGenerator, getAIOutreachGenerator, createDefaultGuidelines } from './AIOutreachGenerator.js';
import {
  RileyConversationRepository,
  rileyConversationRepo,
  ConversationWithMessages,
} from '../repositories/RileyConversationRepository.js';
import { getNotificationService } from './NotificationService.js';
import type { OutreachTracker, RileyConversationStage, RecruiterCalendlyLink } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface OrchestratorInput {
  conversation: ConversationWithMessages;
  message: string;
  messageId?: string;
  tenantId?: string;
}

export interface OrchestratorResult {
  response: string;
  calendlyLink?: string;
  recruiterName?: string;
  newStage?: RileyConversationStage;
  shouldSend: boolean;
  shouldEscalate: boolean;
  escalationReason?: string;
}

export interface FollowUpInput {
  tracker: OutreachTracker;
  followUpNumber: number;
  tenantId?: string;
}

export interface FollowUpResult {
  message: string;
  includesCalendly: boolean;
  calendlyLink?: string;
  recruiterName?: string;
}

// Default keywords that trigger escalation to human
const DEFAULT_ESCALATION_KEYWORDS = [
  'salary',
  'compensation',
  'benefits',
  'equity',
  'stock',
  'pay',
  'offer',
];

// =============================================================================
// SERVICE
// =============================================================================

export class ConversationOrchestrator {
  private autoResponder: RileyAutoResponder;
  private bookingDetector: BookingIntentDetector;
  private calendlyRotator: CalendlyRotatorService;
  private conversationRepo: RileyConversationRepository;
  private outreachGenerator: AIOutreachGenerator;

  constructor(options?: {
    autoResponder?: RileyAutoResponder;
    bookingDetector?: BookingIntentDetector;
    calendlyRotator?: CalendlyRotatorService;
    conversationRepo?: RileyConversationRepository;
    outreachGenerator?: AIOutreachGenerator;
  }) {
    this.autoResponder = options?.autoResponder || rileyAutoResponder;
    this.bookingDetector = options?.bookingDetector || getBookingIntentDetector();
    this.calendlyRotator = options?.calendlyRotator || getCalendlyRotatorService();
    this.conversationRepo = options?.conversationRepo || rileyConversationRepo;
    this.outreachGenerator = options?.outreachGenerator || getAIOutreachGenerator();
  }

  /**
   * Handle incoming candidate message.
   * This is the main entry point called by the webhook handler.
   */
  async handleIncomingMessage(input: OrchestratorInput): Promise<OrchestratorResult> {
    const { conversation, message, tenantId = 'development' } = input;

    console.log(`[Orchestrator] Handling message from ${conversation.candidateName}: "${message.substring(0, 50)}..."`);

    // 1. Get settings
    const settings = await this.getSettings(tenantId);

    // 2. Check if auto-respond is enabled
    if (!settings.autoRespondEnabled) {
      console.log('[Orchestrator] Auto-respond disabled, escalating');
      return {
        response: '',
        shouldSend: false,
        shouldEscalate: true,
        escalationReason: 'Auto-respond is disabled',
      };
    }

    // 3. Check for escalation keywords
    const escalationKeywords = this.parseEscalationKeywords(settings.escalateToHumanKeywords);
    const escalationResult = this.checkEscalationKeywords(message, escalationKeywords);
    if (escalationResult.shouldEscalate) {
      console.log(`[Orchestrator] Escalation keyword detected: ${escalationResult.keyword}`);

      // Send real-time escalation notification
      const notificationService = getNotificationService(tenantId);
      await notificationService.notifyEscalationNeeded({
        conversationId: conversation.id,
        candidateName: conversation.candidateName || undefined,
        reason: `Candidate mentioned: ${escalationResult.keyword}`,
        tenantId,
      });

      return {
        response: '',
        shouldSend: false,
        shouldEscalate: true,
        escalationReason: `Candidate mentioned: ${escalationResult.keyword}`,
        newStage: 'SCHEDULING', // Often these lead to scheduling
      };
    }

    // 4. Detect booking intent
    const conversationHistory = this.buildConversationHistory(conversation);
    const intent = await this.bookingDetector.detectIntent(message, conversationHistory);

    console.log(`[Orchestrator] Intent detection: hasIntent=${intent.hasBookingIntent}, confidence=${intent.confidence.toFixed(2)}`);

    // 5. Generate AI response
    const responseContext: AutoResponseContext = {
      conversation,
      incomingMessage: message,
    };
    const aiResult = await this.autoResponder.generateResponse(responseContext);

    // If AI decided to escalate
    if (aiResult.shouldEscalate) {
      console.log(`[Orchestrator] AI triggered escalation: ${aiResult.escalationReason}`);

      // Send real-time escalation notification
      const notificationService = getNotificationService(tenantId);
      await notificationService.notifyEscalationNeeded({
        conversationId: conversation.id,
        candidateName: conversation.candidateName || undefined,
        reason: aiResult.escalationReason || 'AI triggered escalation',
        tenantId,
      });

      return {
        response: '',
        shouldSend: false,
        shouldEscalate: true,
        escalationReason: aiResult.escalationReason,
        newStage: aiResult.suggestedStage,
      };
    }

    let response = aiResult.message;
    let newStage = aiResult.suggestedStage;
    let calendlyLink: string | undefined;
    let recruiterName: string | undefined;

    // 6. If booking intent detected and not already in scheduling stage, add Calendly link
    if (
      this.bookingDetector.shouldIncludeCalendly(intent) &&
      conversation.stage !== 'SCHEDULING' &&
      conversation.stage !== 'SCHEDULED'
    ) {
      console.log('[Orchestrator] Including Calendly link in response');

      const link = await this.calendlyRotator.getNextLink(tenantId);
      if (link) {
        // Record the assignment
        await this.calendlyRotator.recordAssignment({
          calendlyLinkId: link.id,
          candidateProviderId: conversation.candidateProviderId,
          candidateName: conversation.candidateName || undefined,
          jobRequisitionId: conversation.jobRequisitionId || undefined,
          rileyConversationId: conversation.id,
          tenantId,
        });

        // Append Calendly link to response
        response = this.appendCalendlyToResponse(response, link);
        calendlyLink = link.calendlyUrl;
        recruiterName = link.recruiterName;
        newStage = 'SCHEDULING';

        console.log(`[Orchestrator] Assigned Calendly link from ${link.recruiterName}`);
      } else {
        console.warn('[Orchestrator] No active Calendly links available');
      }
    }

    return {
      response,
      calendlyLink,
      recruiterName,
      newStage,
      shouldSend: true,
      shouldEscalate: false,
    };
  }

  /**
   * Generate follow-up message for no-response scenarios.
   */
  async generateFollowUp(input: FollowUpInput): Promise<FollowUpResult> {
    const { tracker, followUpNumber, tenantId = 'development' } = input;

    console.log(`[Orchestrator] Generating follow-up #${followUpNumber} for ${tracker.candidateName}`);

    // Get settings
    const settings = await this.getSettings(tenantId);
    const isFinalFollowUp = followUpNumber >= settings.maxFollowUps;

    // Build candidate info for the generator
    const candidate = {
      id: tracker.candidateProviderId,
      name: tracker.candidateName || 'there',
      experience: [],
      skills: [],
      education: [],
      profileUrl: tracker.candidateProfileUrl || '',
    };

    // Generate the follow-up
    const daysSince = this.calculateDaysSince(tracker.pitchSentAt || tracker.sentAt);
    const originalMessage = tracker.messageContent || '';

    const message = await this.outreachGenerator.generateFollowUp(
      candidate,
      originalMessage,
      daysSince,
      createDefaultGuidelines(),
      'linkedin_connection'
    );

    let finalMessage = message;
    let includesCalendly = false;
    let calendlyLink: string | undefined;
    let recruiterName: string | undefined;

    // Include Calendly link in final follow-up if configured
    if (isFinalFollowUp && settings.includeCalendlyInFinal) {
      console.log('[Orchestrator] Including Calendly link in final follow-up');

      const link = await this.calendlyRotator.getNextLink(tenantId);
      if (link) {
        await this.calendlyRotator.recordAssignment({
          calendlyLinkId: link.id,
          candidateProviderId: tracker.candidateProviderId,
          candidateName: tracker.candidateName || undefined,
          jobRequisitionId: tracker.jobRequisitionId || undefined,
          tenantId,
        });

        finalMessage = this.appendCalendlyToResponse(message, link);
        includesCalendly = true;
        calendlyLink = link.calendlyUrl;
        recruiterName = link.recruiterName;

        console.log(`[Orchestrator] Final follow-up with Calendly from ${link.recruiterName}`);
      }
    }

    return {
      message: finalMessage,
      includesCalendly,
      calendlyLink,
      recruiterName,
    };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Append Calendly link to a response message.
   */
  private appendCalendlyToResponse(response: string, link: RecruiterCalendlyLink): string {
    // Check if response already ends with punctuation
    const cleanResponse = response.trim();
    const needsPeriod = !/[.!?]$/.test(cleanResponse);

    return `${cleanResponse}${needsPeriod ? '.' : ''}\n\nIf you'd like to discuss further, feel free to schedule a quick call at your convenience: ${link.calendlyUrl}`;
  }

  /**
   * Check message for escalation keywords.
   */
  private checkEscalationKeywords(
    message: string,
    keywords: string[]
  ): { shouldEscalate: boolean; keyword?: string } {
    const lowerMessage = message.toLowerCase();

    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        return { shouldEscalate: true, keyword };
      }
    }

    return { shouldEscalate: false };
  }

  /**
   * Parse escalation keywords from settings (stored as JSON).
   */
  private parseEscalationKeywords(stored: unknown): string[] {
    if (Array.isArray(stored)) {
      return stored.map(k => String(k));
    }
    if (typeof stored === 'string') {
      try {
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : DEFAULT_ESCALATION_KEYWORDS;
      } catch {
        return DEFAULT_ESCALATION_KEYWORDS;
      }
    }
    return DEFAULT_ESCALATION_KEYWORDS;
  }

  /**
   * Build conversation history for intent detection.
   */
  private buildConversationHistory(conversation: ConversationWithMessages): ConversationMessage[] {
    return (conversation.messages || []).map(msg => ({
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt,
    }));
  }

  /**
   * Calculate days since a date.
   */
  private calculateDaysSince(date: Date | null | undefined): number {
    if (!date) return 0;
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Get outreach settings with defaults.
   */
  private async getSettings(tenantId: string): Promise<OutreachSettingsWithCalendly> {
    const service = getOutreachSettingsService();
    const settings = service.getSettings(tenantId);

    // Add defaults for new fields that may not exist in legacy in-memory storage
    return {
      autopilotMode: settings.autopilotMode,
      pitchDelayMinutes: settings.pitchDelayMinutes,
      followUpEnabled: settings.followUpEnabled,
      followUpDays: settings.followUpDays,
      maxFollowUps: settings.maxFollowUps,
      // New fields with defaults
      autoRespondEnabled: true,
      includeCalendlyInFinal: true,
      escalateToHumanKeywords: DEFAULT_ESCALATION_KEYWORDS,
    };
  }
}

// Extended settings interface for orchestrator (same as OutreachSettings but with looser typing for escalateToHumanKeywords from JSON)
interface OutreachSettingsWithCalendly {
  autopilotMode: boolean;
  pitchDelayMinutes: number;
  followUpEnabled: boolean;
  followUpDays: number[];
  maxFollowUps: number;
  autoRespondEnabled: boolean;
  includeCalendlyInFinal: boolean;
  escalateToHumanKeywords: string[] | unknown;
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: ConversationOrchestrator | null = null;

export function getConversationOrchestrator(): ConversationOrchestrator {
  if (!instance) {
    instance = new ConversationOrchestrator();
  }
  return instance;
}

export function resetConversationOrchestrator(): void {
  instance = null;
}

export const conversationOrchestrator = {
  get instance(): ConversationOrchestrator {
    return getConversationOrchestrator();
  },
  handleIncomingMessage: (input: OrchestratorInput) =>
    getConversationOrchestrator().handleIncomingMessage(input),
  generateFollowUp: (input: FollowUpInput) =>
    getConversationOrchestrator().generateFollowUp(input),
};
