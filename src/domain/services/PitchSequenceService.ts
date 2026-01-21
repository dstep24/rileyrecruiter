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
import { prisma } from '../../infrastructure/database/prisma.js';
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
  private unipileClient: UnipileClient;
  private outreachGenerator: AIOutreachGenerator;
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
  }) {
    this.unipileClient = options?.unipileClient || getUnipileClient();
    this.outreachGenerator = options?.outreachGenerator || getAIOutreachGenerator();
    this.outreachTrackerRepo = options?.outreachTrackerRepo || outreachTrackerRepo;
    this.conversationRepo = options?.conversationRepo || rileyConversationRepo;
    this.notificationService = options?.notificationService || getNotificationService();
    this.config = { ...DEFAULT_CONFIG, ...options?.config };
  }

  /**
   * Send the pitch message after connection acceptance
   */
  async sendPitch(tracker: OutreachTracker): Promise<PitchResult> {
    console.log('[PitchSequenceService] Sending pitch to:', tracker.candidateName);

    try {
      // 1. Get candidate profile from Unipile for personalization
      let profile: UnipileProfile | null = null;
      try {
        profile = await this.unipileClient.getProfile(tracker.candidateProviderId);
      } catch (error) {
        console.warn('[PitchSequenceService] Could not fetch profile, using tracker data:', error);
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

      // 4. Send via LinkedIn (now we're 1st degree connected)
      const sentMessage = await this.unipileClient.sendMessage(
        tracker.candidateProviderId,
        pitchMessage
      );

      // 5. Create RileyConversation record
      const conversation = await this.conversationRepo.createFromOutreach({
        chatId: sentMessage.chat_id || `pitch_${tracker.id}_${Date.now()}`,
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
        messageId: sentMessage.id,
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
      linkedinUrl: profile?.profile_url || tracker.candidateProfileUrl || '',
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
        linkedinUrl: tracker.candidateProfileUrl || '',
      },
      originalMessage,
      daysSince,
      createDefaultGuidelines(),
      'linkedin_connection'
    );

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
        // Schedule delayed pitch (would need a job queue in production)
        console.log(`[PitchSequenceService] Pitch delayed by ${this.config.pitchDelayMinutes} minutes`);
        await this.outreachTrackerRepo.markPitchPending(tracker.id);
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
