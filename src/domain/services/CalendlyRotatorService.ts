/**
 * Calendly Rotator Service
 *
 * Manages round-robin assignment of recruiter Calendly links to candidates.
 * Ensures each recruiter gets equivalent booking opportunities.
 *
 * Features:
 * - Round-robin link selection (fewest assignments first)
 * - Assignment tracking per candidate/job
 * - Booking confirmation tracking
 * - Statistics for dashboard
 */

import { prisma } from '../../infrastructure/database/prisma.js';
import type { RecruiterCalendlyLink, CalendlyLinkAssignment } from '../../generated/prisma/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreateLinkInput {
  recruiterName: string;
  calendlyUrl: string;
  tenantId?: string;
}

export interface UpdateLinkInput {
  recruiterName?: string;
  calendlyUrl?: string;
  isActive?: boolean;
}

export interface RecordAssignmentInput {
  calendlyLinkId: string;
  candidateProviderId: string;
  candidateName?: string;
  jobRequisitionId?: string;
  rileyConversationId?: string;
  tenantId?: string;
}

export interface CalendlyStats {
  totalLinks: number;
  activeLinks: number;
  totalAssignments: number;
  confirmedBookings: number;
  bookingRate: number;
  byRecruiter: Array<{
    id: string;
    name: string;
    calendlyUrl: string;
    isActive: boolean;
    assignments: number;
    bookings: number;
    bookingRate: number;
  }>;
}

// =============================================================================
// SERVICE
// =============================================================================

export class CalendlyRotatorService {
  /**
   * Get the next Calendly link using round-robin selection.
   * Selects the active link with the fewest assignments.
   * Uses lastAssignedAt as a tiebreaker (least recently used).
   */
  async getNextLink(tenantId: string = 'development'): Promise<RecruiterCalendlyLink | null> {
    // Get active links ordered by:
    // 1. assignmentCount ASC (fewest assignments first)
    // 2. lastAssignedAt ASC NULLS FIRST (never assigned first, then least recently used)
    const link = await prisma.recruiterCalendlyLink.findFirst({
      where: {
        tenantId,
        isActive: true,
      },
      orderBy: [
        { assignmentCount: 'asc' },
        { lastAssignedAt: 'asc' },
      ],
    });

    if (link) {
      console.log(`[CalendlyRotator] Selected link: ${link.recruiterName} (${link.assignmentCount} assignments)`);
    } else {
      console.warn('[CalendlyRotator] No active Calendly links available');
    }

    return link;
  }

  /**
   * Record that a link was assigned to a candidate.
   * Updates the assignment count and last assigned timestamp.
   */
  async recordAssignment(input: RecordAssignmentInput): Promise<CalendlyLinkAssignment> {
    const {
      calendlyLinkId,
      candidateProviderId,
      candidateName,
      jobRequisitionId,
      rileyConversationId,
      tenantId = 'development',
    } = input;

    // Create the assignment and update the link in a transaction
    const [assignment] = await prisma.$transaction([
      // Create assignment record
      prisma.calendlyLinkAssignment.create({
        data: {
          calendlyLinkId,
          candidateProviderId,
          candidateName,
          jobRequisitionId,
          rileyConversationId,
          tenantId,
        },
      }),
      // Update link's assignment count and timestamp
      prisma.recruiterCalendlyLink.update({
        where: { id: calendlyLinkId },
        data: {
          assignmentCount: { increment: 1 },
          lastAssignedAt: new Date(),
        },
      }),
    ]);

    console.log(`[CalendlyRotator] Recorded assignment: link=${calendlyLinkId}, candidate=${candidateName || candidateProviderId}`);

    return assignment;
  }

  /**
   * Mark a booking as confirmed (for tracking success rates).
   */
  async confirmBooking(assignmentId: string): Promise<CalendlyLinkAssignment> {
    const assignment = await prisma.calendlyLinkAssignment.update({
      where: { id: assignmentId },
      data: {
        bookingConfirmed: true,
        bookingConfirmedAt: new Date(),
      },
    });

    console.log(`[CalendlyRotator] Booking confirmed: ${assignmentId}`);

    return assignment;
  }

  /**
   * Get statistics for dashboard display.
   */
  async getStats(tenantId: string = 'development'): Promise<CalendlyStats> {
    // Get all links with their assignments
    const links = await prisma.recruiterCalendlyLink.findMany({
      where: { tenantId },
      include: {
        assignments: {
          select: {
            id: true,
            bookingConfirmed: true,
          },
        },
      },
      orderBy: { recruiterName: 'asc' },
    });

    // Get aggregate totals
    const totalAssignments = await prisma.calendlyLinkAssignment.count({
      where: { tenantId },
    });

    const confirmedBookings = await prisma.calendlyLinkAssignment.count({
      where: {
        tenantId,
        bookingConfirmed: true,
      },
    });

    // Build per-recruiter stats
    const byRecruiter = links.map(link => {
      const linkBookings = link.assignments.filter(a => a.bookingConfirmed).length;
      const linkAssignments = link.assignments.length;
      return {
        id: link.id,
        name: link.recruiterName,
        calendlyUrl: link.calendlyUrl,
        isActive: link.isActive,
        assignments: linkAssignments,
        bookings: linkBookings,
        bookingRate: linkAssignments > 0 ? (linkBookings / linkAssignments) * 100 : 0,
      };
    });

    return {
      totalLinks: links.length,
      activeLinks: links.filter(l => l.isActive).length,
      totalAssignments,
      confirmedBookings,
      bookingRate: totalAssignments > 0 ? (confirmedBookings / totalAssignments) * 100 : 0,
      byRecruiter,
    };
  }

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new recruiter Calendly link.
   */
  async createLink(input: CreateLinkInput): Promise<RecruiterCalendlyLink> {
    const { recruiterName, calendlyUrl, tenantId = 'development' } = input;

    // Validate URL format
    if (!this.isValidCalendlyUrl(calendlyUrl)) {
      throw new Error('Invalid Calendly URL format. Expected format: https://calendly.com/...');
    }

    const link = await prisma.recruiterCalendlyLink.create({
      data: {
        recruiterName,
        calendlyUrl,
        tenantId,
      },
    });

    console.log(`[CalendlyRotator] Created link: ${recruiterName} - ${calendlyUrl}`);

    return link;
  }

  /**
   * Update a recruiter Calendly link.
   */
  async updateLink(id: string, input: UpdateLinkInput): Promise<RecruiterCalendlyLink> {
    const { recruiterName, calendlyUrl, isActive } = input;

    // Validate URL if provided
    if (calendlyUrl && !this.isValidCalendlyUrl(calendlyUrl)) {
      throw new Error('Invalid Calendly URL format. Expected format: https://calendly.com/...');
    }

    const link = await prisma.recruiterCalendlyLink.update({
      where: { id },
      data: {
        ...(recruiterName !== undefined && { recruiterName }),
        ...(calendlyUrl !== undefined && { calendlyUrl }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    console.log(`[CalendlyRotator] Updated link: ${id}`);

    return link;
  }

  /**
   * Delete a recruiter Calendly link.
   * Note: This will also delete all associated assignments due to cascading delete.
   */
  async deleteLink(id: string): Promise<void> {
    await prisma.recruiterCalendlyLink.delete({
      where: { id },
    });

    console.log(`[CalendlyRotator] Deleted link: ${id}`);
  }

  /**
   * List all recruiter Calendly links for a tenant.
   */
  async listLinks(tenantId: string = 'development'): Promise<RecruiterCalendlyLink[]> {
    return prisma.recruiterCalendlyLink.findMany({
      where: { tenantId },
      orderBy: [
        { isActive: 'desc' },
        { recruiterName: 'asc' },
      ],
    });
  }

  /**
   * List assignment history.
   */
  async listAssignments(
    limit: number = 50,
    offset: number = 0,
    tenantId: string = 'development'
  ): Promise<CalendlyLinkAssignment[]> {
    return prisma.calendlyLinkAssignment.findMany({
      where: { tenantId },
      include: {
        calendlyLink: {
          select: {
            id: true,
            recruiterName: true,
          },
        },
      },
      orderBy: { linkSentAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Find assignment by candidate provider ID.
   */
  async findAssignmentByCandidate(
    candidateProviderId: string,
    tenantId: string = 'development'
  ): Promise<CalendlyLinkAssignment | null> {
    return prisma.calendlyLinkAssignment.findFirst({
      where: {
        candidateProviderId,
        tenantId,
      },
      include: {
        calendlyLink: true,
      },
      orderBy: { linkSentAt: 'desc' },
    });
  }

  /**
   * Find recent unconfirmed assignment by Calendly link URL.
   * Used when matching Calendly webhooks which only contain the event URI.
   */
  async findRecentUnconfirmedAssignment(
    calendlyUrl: string,
    withinHours: number = 72
  ): Promise<CalendlyLinkAssignment | null> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - withinHours);

    // First, find the link by URL
    const link = await prisma.recruiterCalendlyLink.findFirst({
      where: {
        calendlyUrl: {
          startsWith: calendlyUrl.split('/').slice(0, 4).join('/'), // Match base Calendly URL
        },
      },
    });

    if (!link) {
      return null;
    }

    // Find the most recent unconfirmed assignment for this link
    return prisma.calendlyLinkAssignment.findFirst({
      where: {
        calendlyLinkId: link.id,
        bookingConfirmed: false,
        linkSentAt: {
          gte: cutoff,
        },
      },
      include: {
        calendlyLink: true,
      },
      orderBy: { linkSentAt: 'desc' },
    });
  }

  /**
   * Find assignment by candidate name (case-insensitive partial match).
   * Used when matching Calendly webhooks by invitee name.
   */
  async findAssignmentByCandidateName(
    candidateName: string,
    calendlyLinkId?: string,
    withinHours: number = 72
  ): Promise<CalendlyLinkAssignment | null> {
    const cutoff = new Date();
    cutoff.setHours(cutoff.getHours() - withinHours);

    return prisma.calendlyLinkAssignment.findFirst({
      where: {
        candidateName: {
          contains: candidateName,
          mode: 'insensitive',
        },
        bookingConfirmed: false,
        linkSentAt: {
          gte: cutoff,
        },
        ...(calendlyLinkId && { calendlyLinkId }),
      },
      include: {
        calendlyLink: true,
      },
      orderBy: { linkSentAt: 'desc' },
    });
  }

  /**
   * Confirm booking and update conversation stage.
   * Also updates the linked Riley conversation to SCHEDULED status.
   */
  async confirmBookingWithConversation(
    assignmentId: string,
    bookingDetails?: {
      eventUri?: string;
      eventStartTime?: Date;
      inviteeEmail?: string;
    }
  ): Promise<CalendlyLinkAssignment> {
    const assignment = await prisma.calendlyLinkAssignment.update({
      where: { id: assignmentId },
      data: {
        bookingConfirmed: true,
        bookingConfirmedAt: new Date(),
      },
      include: {
        calendlyLink: true,
      },
    });

    console.log(`[CalendlyRotator] Booking confirmed: ${assignmentId}`);

    // Update linked conversation stage to SCHEDULED if exists
    if (assignment.rileyConversationId) {
      try {
        await prisma.rileyConversation.update({
          where: { id: assignment.rileyConversationId },
          data: {
            stage: 'SCHEDULED',
            schedulingRequested: true,
            scheduledCallAt: bookingDetails?.eventStartTime,
          },
        });
        console.log(`[CalendlyRotator] Updated conversation ${assignment.rileyConversationId} to SCHEDULED`);
      } catch (error) {
        console.error('[CalendlyRotator] Failed to update conversation:', error);
      }
    }

    return assignment;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Validate Calendly URL format.
   */
  private isValidCalendlyUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.hostname === 'calendly.com' || parsed.hostname.endsWith('.calendly.com');
    } catch {
      return false;
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: CalendlyRotatorService | null = null;

export function getCalendlyRotatorService(): CalendlyRotatorService {
  if (!instance) {
    instance = new CalendlyRotatorService();
  }
  return instance;
}

export function resetCalendlyRotatorService(): void {
  instance = null;
}

export const calendlyRotatorService = {
  get instance(): CalendlyRotatorService {
    return getCalendlyRotatorService();
  },
  getNextLink: (tenantId?: string) => getCalendlyRotatorService().getNextLink(tenantId),
  recordAssignment: (input: RecordAssignmentInput) => getCalendlyRotatorService().recordAssignment(input),
  confirmBooking: (assignmentId: string) => getCalendlyRotatorService().confirmBooking(assignmentId),
  getStats: (tenantId?: string) => getCalendlyRotatorService().getStats(tenantId),
  createLink: (input: CreateLinkInput) => getCalendlyRotatorService().createLink(input),
  updateLink: (id: string, input: UpdateLinkInput) => getCalendlyRotatorService().updateLink(id, input),
  deleteLink: (id: string) => getCalendlyRotatorService().deleteLink(id),
  listLinks: (tenantId?: string) => getCalendlyRotatorService().listLinks(tenantId),
  listAssignments: (limit?: number, offset?: number, tenantId?: string) =>
    getCalendlyRotatorService().listAssignments(limit, offset, tenantId),
  findAssignmentByCandidate: (candidateProviderId: string, tenantId?: string) =>
    getCalendlyRotatorService().findAssignmentByCandidate(candidateProviderId, tenantId),
};
