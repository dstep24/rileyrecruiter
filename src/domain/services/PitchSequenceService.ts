/**
 * Pitch Sequence Service
 *
 * Handles sending pitch messages to candidates after they accept connection requests.
 * Uses AIOutreachGenerator to create personalized messages, then sends via Unipile.
 *
 * Flow:
 * 1. Connection request accepted (detected via webhook)
 * 2. Generate personalized pitch message using AI
 * 3. Send message via LinkedIn (now we're 1st degree connected)
 * 4. Create RileyConversation record for tracking
 * 5. Schedule follow-ups if enabled
 */

import { getUnipileClient, UnipileClient, UnipileProfile } from '../../integrations/linkedin/UnipileClient.js';
import { AIOutreachGenerator, createDefaultGuidelines, getAIOutreachGenerator } from './AIOutreachGenerator.js';
import { OutreachTrackerRepository, outreachTrackerRepo } from '../repositories/OutreachTrackerRepository.js';
import { RileyConversationRepository, rileyConversationRepo } from '../repositories/RileyConversationRepository.js';
import { NotificationService, getNotificationService } from './NotificationService.js';
import { scheduleDelayedPitch } from '../../infrastructure/queue/workers.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { ClaudeClient } from '../../integrations/llm/ClaudeClient.js';
import type { OutreachTracker } from '../../generated/prisma/index.js';
import type { CandidateProfile } from './AICandidateScorer.js';

// =============================================================================
// TYPES
// =============================================================================

export interface PitchResult {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  error?: string;
}

export interface PitchSequenceConfig {
  autoPitchOnAcceptance: boolean;
  pitchDelayMinutes: number;
  followUpEnabled: boolean;
  followUpDays: number[];
  maxFollowUps: number;
}

const DEFAULT_CONFIG: PitchSequenceConfig = {
  autoPitchOnAcceptance: true,
  pitchDelayMinutes: 0, // Immediate
  followUpEnabled: true,
  followUpDays: [3, 7, 14], // Days after pitch
  maxFollowUps: 3,
};

// =============================================================================
// SERVICE
// =============================================================================

export class PitchSequenceService {
  private unipileClient: UnipileClient | null;
  private outreachGenerator: AIOutreachGenerator | null;
  private outreachTrackerRepo: OutreachTrackerRepository;
  private conversationRepo: RileyConversationRepository;
  private notificationService: NotificationService;
  private config: PitchSequenceConfig;

  constructor(options?: {
    unipileClient?: UnipileClient;
    outreachGenerator?: AIOutreachGenerator;
    outreachTrackerRepo?: OutreachTrackerRepository;
    conversationRepo?: RileyConversationRepository;
    notificationService?: NotificationService;
    config?: Partial<PitchSequenceConfig>;
    /** Optional API key for AI generation. If provided, creates a fresh AIOutreachGenerator with this key. */
    anthropicApiKey?: string;
    /** Skip AI initialization - use when only sending custom messages that don't need AI */
    skipAIInit?: boolean;
  }) {
    // Try to get the singleton, but don't fail if not initialized
    try {
      this.unipileClient = options?.unipileClient || getUnipileClient();
    } catch {
      console.warn('[PitchSequenceService] UnipileClient not available - profile enrichment will be skipped');
      this.unipileClient = null;
    }

    // Skip AI initialization if requested (useful when only sending custom messages)
    if (options?.skipAIInit) {
      this.outreachGenerator = null;
      console.log('[PitchSequenceService] AI initialization skipped - custom message mode');
    } else if (options?.anthropicApiKey) {
      // If an API key is provided, create a custom AIOutreachGenerator with that key
      const claudeClient = new ClaudeClient({ apiKey: options.anthropicApiKey });
      this.outreachGenerator = new AIOutreachGenerator(claudeClient);
      console.log('[PitchSequenceService] Using provided Anthropic API key for AI generation');
    } else {
      // Try to get the default generator, but don't fail if API key is missing
      try {
        this.outreachGenerator = options?.outreachGenerator || getAIOutreachGenerator();
      } catch (error) {
        console.warn('[PitchSequenceService] AIOutreachGenerator not available - AI pitch generation will fail:', error);
        this.outreachGenerator = null;
      }
    }

    this.outreachTrackerRepo = options?.outreachTrackerRepo || outreachTrackerRepo;
    this.conversationRepo = options?.conversationRepo || rileyConversationRepo;
    this.notificationService = options?.notificationService || getNotificationService();
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
  }

  /**
   * Generate a pitch message preview without sending it
   */
  async generatePitchPreview(tracker: OutreachTracker): Promise<{ success: boolean; message?: string; error?: string }> {
    console.log('[PitchSequenceService] Generating pitch preview for:', tracker.candidateName);

    // Check if AI generator is available
    if (!this.outreachGenerator) {
      return {
        success: false,
        error: 'AI pitch generation requires an Anthropic API key. Please configure it in Settings.',
      };
    }

    try {
      // 1. Get candidate profile from Unipile for personalization (optional)
      let profile: UnipileProfile | null = null;
      if (this.unipileClient) {
        try {
          profile = await this.unipileClient.getProfile(tracker.candidateProviderId);
        } catch (error) {
          console.warn('[PitchSequenceService] Could not fetch profile, using tracker data:', error);
        }
      } else {
        console.log('[PitchSequenceService] Skipping profile enrichment - UnipileClient not available');
      }

      // 2. Get job requisition details if available
      let jobDetails = null;
      if (tracker.jobRequisitionId) {
        jobDetails = await prisma.jobRequisition.findUnique({
          where: { id: tracker.jobRequisitionId },
        });
      }

      // 3. Generate AI pitch message
      const pitchMessage = await this.generatePitchMessage(tracker, profile, jobDetails);

      return {
        success: true,
        message: pitchMessage,
      };
    } catch (error) {
      console.error('[PitchSequenceService] Failed to generate pitch preview:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error generating pitch',
      };
    }
  }

  /**
   * Send the pitch message after connection acceptance
   * @param tracker - The outreach tracker
   * @param customMessage - Optional custom message to send instead of auto-generated one
   */
  async sendPitch(tracker: OutreachTracker, customMessage?: string): Promise<PitchResult> {
    console.log('[PitchSequenceService] Sending pitch to:', tracker.candidateName, customMessage ? '(custom message)' : '(auto-generated)');

    try {
      let pitchMessage: string;

      if (customMessage) {
        // Use the provided custom message
        pitchMessage = customMessage;
      } else {
        // 1. Get candidate profile from Unipile for personalization (optional)
        let profile: UnipileProfile | null = null;
        if (this.unipileClient) {
          try {
            profile = await this.unipileClient.getProfile(tracker.candidateProviderId);
          } catch (error) {
            console.warn('[PitchSequenceService] Could not fetch profile, using tracker data:', error);
          }
        } else {
          console.log('[PitchSequenceService] Skipping profile enrichment - UnipileClient not available');
        }

        // 2. Get job requisition details if available
        let jobDetails = null;
        if (tracker.jobRequisitionId) {
          jobDetails = await prisma.jobRequisition.findUnique({
            where: { id: tracker.jobRequisitionId },
          });
        }

        // 3. Generate AI pitch message
        pitchMessage = await this.generatePitchMessage(tracker, profile, jobDetails);
      }

      // 4. Send via LinkedIn (now we're 1st degree connected)
      // Use startChat (POST /chats) to initiate a new conversation, not sendMessage
      // which is for replying in an existing chat (POST /chats/message)
      if (!this.unipileClient) {
        return {
          success: false,
          error: 'Cannot send pitch - LinkedIn client not initialized. Please check your Unipile configuration.',
        };
      }
      const chatResult = await this.unipileClient.startChat(
        [tracker.candidateProviderId],
        pitchMessage
      );

      // 5. Create RileyConversation record
      const conversation = await this.conversationRepo.createFromOutreach({
        chatId: chatResult.chat_id || `pitch_${tracker.id}_${Date.now()}`,
        candidateProviderId: tracker.candidateProviderId,
        candidateName: tracker.candidateName || undefined,
        candidateProfileUrl: tracker.candidateProfileUrl || undefined,
        jobRequisitionId: tracker.jobRequisitionId || undefined,
        jobTitle: tracker.jobTitle || undefined,
        initialMessage: pitchMessage,
      });

      // 6. Update tracker
      await this.outreachTrackerRepo.markPitchSent(tracker.id, conversation.id);

      // 7. Create notification
      await this.notificationService.notifyPitchSent({
        trackerId: tracker.id,
        conversationId: conversation.id,
        candidateName: tracker.candidateName || undefined,
        jobTitle: tracker.jobTitle || undefined,
        tenantId: tracker.tenantId,
      });

      // 8. Schedule follow-ups if enabled
      if (this.config.followUpEnabled) {
        await this.scheduleFollowUp(tracker.id, 0);
      }

      console.log('[PitchSequenceService] Pitch sent successfully, conversation:', conversation.id);

      return {
        success: true,
        conversationId: conversation.id,
        messageId: chatResult.message?.id,
      };
    } catch (error) {
      console.error('[PitchSequenceService] Failed to send pitch:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error sending pitch',
      };
    }
  }

  /**
   * Generate personalized pitch message using AI
   */
  private async generatePitchMessage(
    tracker: OutreachTracker,
    profile: UnipileProfile | null,
    jobDetails: { title: string; description: string; requirements?: unknown } | null
  ): Promise<string> {
    // Ensure AI generator is available
    if (!this.outreachGenerator) {
      throw new Error('AI pitch generation requires an Anthropic API key. Please configure it in Settings.');
    }

    // Build candidate profile for the generator
    const candidateProfile: CandidateProfile = {
      id: tracker.candidateProviderId,
      name: tracker.candidateName || profile?.name || 'Candidate',
      headline: profile?.headline,
      currentTitle: profile?.current_title,
      currentCompany: profile?.current_company,
      location: profile?.location,
      experience: (profile?.experiences || []).map(exp => ({
        title: exp.title,
        company: exp.company_name,
        duration: this.formatDuration(exp.start_date, exp.end_date),
        description: exp.description,
      })),
      skills: this.normalizeSkills(profile?.skills || []),
      education: (profile?.educations || []).map(edu => ({
        school: edu.school_name,
        degree: edu.degree,
        field: edu.field_of_study,
        year: edu.end_year?.toString(),
      })),
      profileUrl: profile?.profile_url || tracker.candidateProfileUrl || '',
    };

    // Build role info
    const roleInfo = {
      title: tracker.jobTitle || jobDetails?.title || 'this opportunity',
      company: 'Our Client', // Could be enhanced with actual company name
      highlights: this.extractHighlights(jobDetails),
    };

    // Generate the outreach
    const outreach = await this.outreachGenerator.generateOutreach({
      candidate: candidateProfile,
      role: roleInfo,
      guidelines: createDefaultGuidelines(),
      channel: 'linkedin_connection', // Use as direct message post-connection
    });

    return outreach.message;
  }

  /**
   * Schedule next follow-up based on sequence position
   */
  private async scheduleFollowUp(trackerId: string, currentPosition: number): Promise<void> {
    if (currentPosition >= this.config.maxFollowUps || currentPosition >= this.config.followUpDays.length) {
      return;
    }

    const daysUntilFollowUp = this.config.followUpDays[currentPosition];
    const followUpDate = new Date();
    followUpDate.setDate(followUpDate.getDate() + daysUntilFollowUp);

    await this.outreachTrackerRepo.scheduleFollowUp(trackerId, followUpDate);
    console.log(`[PitchSequenceService] Scheduled follow-up for ${followUpDate.toISOString()}`);
  }

  /**
   * Process all trackers that need follow-ups
   */
  async processFollowUps(): Promise<{ processed: number; errors: number }> {
    const dueFollowUps = await this.outreachTrackerRepo.getDueFollowUps();
    let processed = 0;
    let errors = 0;

    for (const tracker of dueFollowUps) {
      try {
        await this.sendFollowUp(tracker);
        processed++;
      } catch (error) {
        console.error('[PitchSequenceService] Follow-up failed for', tracker.id, error);
        errors++;
      }
    }

    return { processed, errors };
  }

  /**
   * Send a follow-up message
   */
  private async sendFollowUp(tracker: OutreachTracker): Promise<void> {
    if (!tracker.rileyConversationId) {
      console.warn('[PitchSequenceService] No conversation ID for follow-up:', tracker.id);
      return;
    }

    // Get the conversation to check last message
    const conversation = await this.conversationRepo.getById(tracker.rileyConversationId);
    if (!conversation) {
      console.warn('[PitchSequenceService] Conversation not found:', tracker.rileyConversationId);
      return;
    }

    // Don't follow up if candidate has replied
    if (conversation.lastMessageBy === 'CANDIDATE') {
      console.log('[PitchSequenceService] Skipping follow-up, candidate already replied');
      await this.outreachTrackerRepo.markReplied(tracker.id);
      return;
    }

    // Ensure AI generator is available for follow-up generation
    if (!this.outreachGenerator) {
      console.warn('[PitchSequenceService] Cannot send follow-up - AI generator not available');
      return;
    }

    // Generate follow-up message
    const originalMessage = conversation.messages?.[0]?.content || tracker.messageContent || '';
    const daysSince = Math.floor(
      (Date.now() - new Date(tracker.pitchSentAt || tracker.sentAt).getTime()) / (1000 * 60 * 60 * 24)
    );

    const followUpMessage = await this.outreachGenerator.generateFollowUp(
      {
        id: tracker.candidateProviderId,
        name: tracker.candidateName || 'there',
        experience: [],
        skills: [],
        education: [],
        profileUrl: tracker.candidateProfileUrl || '',
      },
      originalMessage,
      daysSince,
      createDefaultGuidelines(),
      'linkedin_connection'
    );

    // Ensure LinkedIn client is available for sending
    if (!this.unipileClient) {
      console.warn('[PitchSequenceService] Cannot send follow-up - UnipileClient not available');
      return;
    }

    // Send the follow-up
    const sentMessage = await this.unipileClient.sendMessage(
      tracker.candidateProviderId,
      followUpMessage
    );

    // Record the message
    await this.conversationRepo.addRileyResponse(
      conversation.chatId,
      followUpMessage,
      sentMessage.id
    );

    // Check if we should schedule another follow-up
    const nextPosition = tracker.sequencePosition + 1;
    if (nextPosition < this.config.maxFollowUps && nextPosition < this.config.followUpDays.length) {
      await this.scheduleFollowUp(tracker.id, nextPosition);
    } else {
      // Mark as no response after final follow-up
      await this.outreachTrackerRepo.markNoResponse(tracker.id);
      await this.notificationService.create({
        type: 'FOLLOW_UP_DUE',
        title: `No response from ${tracker.candidateName || 'candidate'}`,
        message: 'Follow-up sequence completed with no response',
        trackerId: tracker.id,
        tenantId: tracker.tenantId,
      });
    }
  }

  /**
   * Handle connection acceptance - main entry point from webhook
   */
  async handleConnectionAccepted(
    tracker: OutreachTracker,
    options?: { autoPitch?: boolean }
  ): Promise<void> {
    const shouldAutoPitch = options?.autoPitch ?? this.config.autoPitchOnAcceptance;

    // Mark connection as accepted
    await this.outreachTrackerRepo.markConnectionAccepted(tracker.id);

    // Create notification
    await this.notificationService.notifyConnectionAccepted({
      trackerId: tracker.id,
      candidateName: tracker.candidateName || undefined,
      jobTitle: tracker.jobTitle || undefined,
      tenantId: tracker.tenantId,
    });

    console.log('[PitchSequenceService] Connection accepted:', tracker.candidateName);

    if (shouldAutoPitch) {
      if (this.config.pitchDelayMinutes > 0) {
        // Schedule delayed pitch via job queue
        console.log(`[PitchSequenceService] Scheduling pitch in ${this.config.pitchDelayMinutes} minutes`);
        await this.outreachTrackerRepo.markPitchPending(tracker.id);
        await scheduleDelayedPitch(tracker.id, this.config.pitchDelayMinutes, tracker.tenantId);
      } else {
        // Immediate pitch
        await this.sendPitch(tracker);
      }
    } else {
      // Mark as ready for manual pitch
      await this.outreachTrackerRepo.markPitchPending(tracker.id);
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private formatDuration(startDate?: string, endDate?: string): string {
    if (!startDate) return '';
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;

    if (years === 0) return `${remainingMonths} mo`;
    if (remainingMonths === 0) return `${years} yr`;
    return `${years} yr ${remainingMonths} mo`;
  }

  private normalizeSkills(skills: string[] | { name: string }[]): string[] {
    if (!skills || skills.length === 0) return [];
    if (typeof skills[0] === 'string') {
      return skills as string[];
    }
    return (skills as { name: string }[]).map(s => s.name);
  }

  private extractHighlights(jobDetails: { requirements?: unknown } | null): string[] {
    if (!jobDetails) return ['Great team culture', 'Competitive compensation'];

    const requirements = jobDetails.requirements;
    if (Array.isArray(requirements)) {
      return requirements.slice(0, 3).map(r => String(r));
    }

    return ['Great team culture', 'Competitive compensation'];
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: PitchSequenceService | null = null;

export function getPitchSequenceService(): PitchSequenceService {
  if (!instance) {
    instance = new PitchSequenceService();
  }
  return instance;
}

export function resetPitchSequenceService(): void {
  instance = null;
}

export const pitchSequenceService = {
  get instance(): PitchSequenceService {
    return getPitchSequenceService();
  },
  sendPitch: (...args: Parameters<PitchSequenceService['sendPitch']>) =>
    getPitchSequenceService().sendPitch(...args),
  handleConnectionAccepted: (...args: Parameters<PitchSequenceService['handleConnectionAccepted']>) =>
    getPitchSequenceService().handleConnectionAccepted(...args),
  processFollowUps: () => getPitchSequenceService().processFollowUps(),
};
