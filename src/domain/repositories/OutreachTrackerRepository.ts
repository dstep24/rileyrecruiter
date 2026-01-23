/**
 * Outreach Tracker Repository
 *
 * Handles persistence of outreach tracking records. Tracks the full lifecycle
 * of candidate outreach from initial connection request through pitch and follow-ups.
 *
 * Used to:
 * - Match webhook events (new_relation) to pending outreach
 * - Track status transitions through the outreach funnel
 * - Link outreach to RileyConversation once pitch is sent
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type {
  OutreachTracker,
  OutreachType,
  OutreachStatus,
} from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateOutreachInput {
  candidateProviderId: string;
  candidateName?: string;
  candidateProfileUrl?: string;
  outreachType: OutreachType;
  messageContent?: string;
  jobRequisitionId?: string;
  jobTitle?: string;
  assessmentTemplateId?: string;
  sourceQueueItemId?: string;
  tenantId?: string;
}

export interface OutreachStats {
  sent: number;
  accepted: number;
  pitchSent: number;
  replied: number;
  acceptanceRate: number;
  replyRate: number;
}

export interface StatusHistoryEntry {
  status: OutreachStatus;
  timestamp: string;
  details?: string;
}

// =============================================================================
// REPOSITORY
// =============================================================================

export class OutreachTrackerRepository {
  /**
   * Create tracking record when connection request is sent from queue
   */
  async createFromQueueItem(data: CreateOutreachInput): Promise<OutreachTracker> {
    const statusHistory: StatusHistoryEntry[] = [
      {
        status: 'SENT',
        timestamp: new Date().toISOString(),
        details: 'Initial outreach sent',
      },
    ];

    return prisma.outreachTracker.create({
      data: {
        candidateProviderId: data.candidateProviderId,
        candidateName: data.candidateName,
        candidateProfileUrl: data.candidateProfileUrl,
        outreachType: data.outreachType,
        messageContent: data.messageContent,
        jobRequisitionId: data.jobRequisitionId,
        jobTitle: data.jobTitle,
        assessmentTemplateId: data.assessmentTemplateId,
        sourceQueueItemId: data.sourceQueueItemId,
        tenantId: data.tenantId || 'development',
        status: 'SENT',
        statusHistory,
        sentAt: new Date(),
      },
    });
  }

  /**
   * Find by ID
   */
  async getById(id: string): Promise<OutreachTracker | null> {
    return prisma.outreachTracker.findUnique({
      where: { id },
      include: {
        rileyConversation: true,
      },
    });
  }

  /**
   * Find by LinkedIn provider ID (for webhook matching)
   * Returns all trackers for this candidate, newest first
   */
  async findByCandidateProviderId(providerId: string): Promise<OutreachTracker[]> {
    return prisma.outreachTracker.findMany({
      where: { candidateProviderId: providerId },
      orderBy: { sentAt: 'desc' },
    });
  }

  /**
   * Find pending outreach for a candidate (connection request not yet accepted)
   * Used when webhook arrives to match to the right tracker
   */
  async findPendingByProviderId(providerId: string): Promise<OutreachTracker | null> {
    return prisma.outreachTracker.findFirst({
      where: {
        candidateProviderId: providerId,
        status: 'SENT',
        outreachType: { in: ['CONNECTION_REQUEST', 'CONNECTION_ONLY'] },
      },
      orderBy: { sentAt: 'desc' },
    });
  }

  /**
   * Find trackers by multiple provider IDs (for batch status sync)
   * Returns the most recent tracker for each provider ID
   */
  async findByProviderIds(providerIds: string[]): Promise<OutreachTracker[]> {
    // Get all trackers for these provider IDs
    const trackers = await prisma.outreachTracker.findMany({
      where: {
        candidateProviderId: { in: providerIds },
      },
      orderBy: { sentAt: 'desc' },
    });

    // Return only the most recent tracker per provider ID
    const seenProviders = new Set<string>();
    const result: OutreachTracker[] = [];

    for (const tracker of trackers) {
      if (!seenProviders.has(tracker.candidateProviderId)) {
        seenProviders.add(tracker.candidateProviderId);
        result.push(tracker);
      }
    }

    return result;
  }

  /**
   * Update status when connection is accepted
   */
  async markConnectionAccepted(id: string): Promise<OutreachTracker> {
    const tracker = await this.getById(id);
    const existingHistory = (tracker?.statusHistory as unknown as StatusHistoryEntry[]) || [];

    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: 'CONNECTION_ACCEPTED',
        timestamp: new Date().toISOString(),
        details: 'LinkedIn connection accepted',
      },
    ];

    return prisma.outreachTracker.update({
      where: { id },
      data: {
        status: 'CONNECTION_ACCEPTED',
        statusHistory,
        acceptedAt: new Date(),
      },
    });
  }

  /**
   * Mark as ready for pitch (intermediate state if not auto-pitching)
   */
  async markPitchPending(id: string): Promise<OutreachTracker> {
    const tracker = await this.getById(id);
    const existingHistory = (tracker?.statusHistory as unknown as StatusHistoryEntry[]) || [];

    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: 'PITCH_PENDING',
        timestamp: new Date().toISOString(),
        details: 'Ready to send pitch message',
      },
    ];

    return prisma.outreachTracker.update({
      where: { id },
      data: {
        status: 'PITCH_PENDING',
        statusHistory,
      },
    });
  }

  /**
   * Update status when pitch is sent, link to conversation
   */
  async markPitchSent(id: string, rileyConversationId: string): Promise<OutreachTracker> {
    const tracker = await this.getById(id);
    const existingHistory = (tracker?.statusHistory as unknown as StatusHistoryEntry[]) || [];

    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: 'PITCH_SENT',
        timestamp: new Date().toISOString(),
        details: 'Pitch message sent',
      },
    ];

    return prisma.outreachTracker.update({
      where: { id },
      data: {
        status: 'PITCH_SENT',
        statusHistory,
        pitchSentAt: new Date(),
        rileyConversationId,
        sequencePosition: 1,
      },
    });
  }

  /**
   * Mark as replied (candidate responded)
   */
  async markReplied(id: string): Promise<OutreachTracker> {
    const tracker = await this.getById(id);
    const existingHistory = (tracker?.statusHistory as unknown as StatusHistoryEntry[]) || [];

    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: 'REPLIED',
        timestamp: new Date().toISOString(),
        details: 'Candidate replied',
      },
    ];

    return prisma.outreachTracker.update({
      where: { id },
      data: {
        status: 'REPLIED',
        statusHistory,
      },
    });
  }

  /**
   * Mark as no response (after follow-up sequence)
   */
  async markNoResponse(id: string): Promise<OutreachTracker> {
    const tracker = await this.getById(id);
    const existingHistory = (tracker?.statusHistory as unknown as StatusHistoryEntry[]) || [];

    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: 'NO_RESPONSE',
        timestamp: new Date().toISOString(),
        details: 'No response after follow-up sequence',
      },
    ];

    return prisma.outreachTracker.update({
      where: { id },
      data: {
        status: 'NO_RESPONSE',
        statusHistory,
        nextFollowUpAt: null,
      },
    });
  }

  /**
   * Mark as declined (explicitly rejected)
   */
  async markDeclined(id: string, reason?: string): Promise<OutreachTracker> {
    const tracker = await this.getById(id);
    const existingHistory = (tracker?.statusHistory as unknown as StatusHistoryEntry[]) || [];

    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: 'DECLINED',
        timestamp: new Date().toISOString(),
        details: reason || 'Connection declined or withdrawn',
      },
    ];

    return prisma.outreachTracker.update({
      where: { id },
      data: {
        status: 'DECLINED',
        statusHistory,
        nextFollowUpAt: null,
      },
    });
  }

  /**
   * Get all trackers with connection accepted status (ready for pitch)
   */
  async getPendingPitches(tenantId?: string): Promise<OutreachTracker[]> {
    return prisma.outreachTracker.findMany({
      where: {
        status: 'CONNECTION_ACCEPTED',
        ...(tenantId && { tenantId }),
      },
      orderBy: { acceptedAt: 'asc' },
    });
  }

  /**
   * Get all trackers pending pitch status
   */
  async getPitchPending(tenantId?: string): Promise<OutreachTracker[]> {
    return prisma.outreachTracker.findMany({
      where: {
        status: 'PITCH_PENDING',
        ...(tenantId && { tenantId }),
      },
      orderBy: { acceptedAt: 'asc' },
    });
  }

  /**
   * Get trackers needing follow-up
   */
  async getDueFollowUps(): Promise<OutreachTracker[]> {
    return prisma.outreachTracker.findMany({
      where: {
        status: 'PITCH_SENT',
        nextFollowUpAt: {
          lte: new Date(),
        },
      },
      orderBy: { nextFollowUpAt: 'asc' },
    });
  }

  /**
   * Schedule next follow-up
   */
  async scheduleFollowUp(id: string, followUpAt: Date): Promise<OutreachTracker> {
    return prisma.outreachTracker.update({
      where: { id },
      data: {
        nextFollowUpAt: followUpAt,
        sequencePosition: { increment: 1 },
      },
    });
  }

  /**
   * List by status for dashboard
   */
  async listByStatus(
    status: OutreachStatus,
    options?: { limit?: number; tenantId?: string }
  ): Promise<OutreachTracker[]> {
    return prisma.outreachTracker.findMany({
      where: {
        status,
        ...(options?.tenantId && { tenantId: options.tenantId }),
      },
      orderBy: { updatedAt: 'desc' },
      take: options?.limit || 50,
    });
  }

  /**
   * List all trackers for dashboard
   */
  async listAll(options?: {
    limit?: number;
    tenantId?: string;
    status?: OutreachStatus[];
  }): Promise<OutreachTracker[]> {
    return prisma.outreachTracker.findMany({
      where: {
        ...(options?.tenantId && { tenantId: options.tenantId }),
        ...(options?.status && { status: { in: options.status } }),
      },
      include: {
        rileyConversation: {
          select: {
            id: true,
            chatId: true,
            stage: true,
            status: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: options?.limit || 100,
    });
  }

  /**
   * Get stats for dashboard
   */
  async getStats(tenantId?: string): Promise<OutreachStats> {
    const where = tenantId ? { tenantId } : {};

    const [sent, accepted, pitchSent, replied] = await Promise.all([
      prisma.outreachTracker.count({ where: { ...where, status: 'SENT' } }),
      prisma.outreachTracker.count({ where: { ...where, status: 'CONNECTION_ACCEPTED' } }),
      prisma.outreachTracker.count({ where: { ...where, status: 'PITCH_SENT' } }),
      prisma.outreachTracker.count({ where: { ...where, status: 'REPLIED' } }),
    ]);

    // Get total for rate calculations
    const total = await prisma.outreachTracker.count({ where });

    // Calculate rates
    const acceptanceRate = total > 0 ? ((accepted + pitchSent + replied) / total) * 100 : 0;
    const replyRate = pitchSent + replied > 0 ? (replied / (pitchSent + replied)) * 100 : 0;

    return {
      sent,
      accepted,
      pitchSent,
      replied,
      acceptanceRate: Math.round(acceptanceRate * 10) / 10,
      replyRate: Math.round(replyRate * 10) / 10,
    };
  }

  /**
   * Get funnel stats for dashboard visualization
   */
  async getFunnelStats(tenantId?: string): Promise<{
    sent: number;
    connectionAccepted: number;
    pitchSent: number;
    replied: number;
    noResponse: number;
    declined: number;
  }> {
    const where = tenantId ? { tenantId } : {};

    const [sent, connectionAccepted, pitchPending, pitchSent, replied, noResponse, declined] =
      await Promise.all([
        prisma.outreachTracker.count({ where: { ...where, status: 'SENT' } }),
        prisma.outreachTracker.count({ where: { ...where, status: 'CONNECTION_ACCEPTED' } }),
        prisma.outreachTracker.count({ where: { ...where, status: 'PITCH_PENDING' } }),
        prisma.outreachTracker.count({ where: { ...where, status: 'PITCH_SENT' } }),
        prisma.outreachTracker.count({ where: { ...where, status: 'REPLIED' } }),
        prisma.outreachTracker.count({ where: { ...where, status: 'NO_RESPONSE' } }),
        prisma.outreachTracker.count({ where: { ...where, status: 'DECLINED' } }),
      ]);

    return {
      sent,
      connectionAccepted: connectionAccepted + pitchPending,
      pitchSent,
      replied,
      noResponse,
      declined,
    };
  }

  /**
   * Delete tracker (for cleanup)
   */
  async delete(id: string): Promise<OutreachTracker> {
    return prisma.outreachTracker.delete({
      where: { id },
    });
  }

  // =============================================================================
  // EMAIL TRACKING METHODS
  // =============================================================================

  /**
   * Find tracker by email message ID (for Resend webhook matching)
   */
  async findByEmailMessageId(emailMessageId: string): Promise<OutreachTracker | null> {
    return prisma.outreachTracker.findFirst({
      where: { emailMessageId },
    });
  }

  /**
   * Update email delivery status from webhook
   */
  async updateEmailStatus(
    emailMessageId: string,
    status: 'QUEUED' | 'SENT' | 'DELIVERED' | 'OPENED' | 'CLICKED' | 'BOUNCED' | 'COMPLAINED' | 'FAILED',
    details?: {
      openedAt?: Date;
      clickedAt?: Date;
      bouncedAt?: Date;
      bounceReason?: string;
    }
  ): Promise<OutreachTracker | null> {
    const tracker = await this.findByEmailMessageId(emailMessageId);
    if (!tracker) return null;

    const existingHistory = (tracker.statusHistory as unknown as StatusHistoryEntry[]) || [];
    const statusHistory: StatusHistoryEntry[] = [
      ...existingHistory,
      {
        status: tracker.status, // Keep outreach status, just log email event
        timestamp: new Date().toISOString(),
        details: `Email ${status.toLowerCase()}${details?.bounceReason ? `: ${details.bounceReason}` : ''}`,
      },
    ];

    return prisma.outreachTracker.update({
      where: { id: tracker.id },
      data: {
        emailStatus: status,
        statusHistory,
        ...(details?.openedAt && { emailOpenedAt: details.openedAt }),
        ...(details?.clickedAt && { emailClickedAt: details.clickedAt }),
        ...(details?.bouncedAt && { emailBouncedAt: details.bouncedAt }),
        ...(details?.bounceReason && { emailBounceReason: details.bounceReason }),
      },
    });
  }

  /**
   * Create email outreach tracker
   */
  async createEmailOutreach(data: CreateOutreachInput & {
    emailAddress: string;
    emailMessageId: string;
    emailSubject?: string;
  }): Promise<OutreachTracker> {
    const statusHistory: StatusHistoryEntry[] = [
      {
        status: 'SENT',
        timestamp: new Date().toISOString(),
        details: 'Email outreach sent',
      },
    ];

    return prisma.outreachTracker.create({
      data: {
        candidateProviderId: data.candidateProviderId,
        candidateName: data.candidateName,
        candidateProfileUrl: data.candidateProfileUrl,
        outreachType: 'EMAIL',
        channel: 'EMAIL',
        messageContent: data.messageContent,
        jobRequisitionId: data.jobRequisitionId,
        jobTitle: data.jobTitle,
        assessmentTemplateId: data.assessmentTemplateId,
        sourceQueueItemId: data.sourceQueueItemId,
        tenantId: data.tenantId || 'development',
        status: 'SENT',
        statusHistory,
        sentAt: new Date(),
        // Email-specific fields
        emailAddress: data.emailAddress,
        emailMessageId: data.emailMessageId,
        emailStatus: 'SENT',
      },
    });
  }

  /**
   * Get email outreach stats
   */
  async getEmailStats(tenantId?: string): Promise<{
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    openRate: number;
    clickRate: number;
  }> {
    const where = {
      channel: 'EMAIL' as const,
      ...(tenantId && { tenantId }),
    };

    const [sent, delivered, opened, clicked, bounced] = await Promise.all([
      prisma.outreachTracker.count({ where: { ...where, emailStatus: 'SENT' } }),
      prisma.outreachTracker.count({ where: { ...where, emailStatus: 'DELIVERED' } }),
      prisma.outreachTracker.count({ where: { ...where, emailStatus: 'OPENED' } }),
      prisma.outreachTracker.count({ where: { ...where, emailStatus: 'CLICKED' } }),
      prisma.outreachTracker.count({ where: { ...where, emailStatus: 'BOUNCED' } }),
    ]);

    const totalDelivered = delivered + opened + clicked;
    const openRate = totalDelivered > 0 ? ((opened + clicked) / totalDelivered) * 100 : 0;
    const clickRate = opened + clicked > 0 ? (clicked / (opened + clicked)) * 100 : 0;

    return {
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      openRate: Math.round(openRate * 10) / 10,
      clickRate: Math.round(clickRate * 10) / 10,
    };
  }
}

// Export singleton instance
export const outreachTrackerRepo = new OutreachTrackerRepository();
