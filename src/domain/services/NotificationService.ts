/**
 * Notification Service
 *
 * Handles in-app notifications for the dashboard. Stores notifications in memory
 * for now (can be moved to database for persistence later).
 *
 * Used to alert recruiters about:
 * - Connection requests being accepted
 * - Pitch messages sent
 * - Candidate replies
 * - Follow-ups due
 * - Escalations needing human attention
 * - Booking confirmations
 *
 * Supports real-time notifications via Server-Sent Events (SSE).
 */

import { EventEmitter } from 'events';
import { prisma } from '../../infrastructure/database/prisma.js';

// Global event emitter for real-time notifications
export const notificationEvents = new EventEmitter();
notificationEvents.setMaxListeners(100); // Support many concurrent SSE connections

// =============================================================================
// TYPES
// =============================================================================

export type NotificationType =
  | 'CONNECTION_ACCEPTED'
  | 'PITCH_SENT'
  | 'CANDIDATE_REPLIED'
  | 'FOLLOW_UP_DUE'
  | 'ASSESSMENT_COMPLETED'
  | 'ESCALATION_NEEDED'
  | 'BOOKING_CONFIRMED';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  trackerId?: string;
  conversationId?: string;
  candidateName?: string;
  jobTitle?: string;
  read: boolean;
  createdAt: Date;
  tenantId: string;
}

export interface CreateNotificationInput {
  type: NotificationType;
  title: string;
  message?: string;
  trackerId?: string;
  conversationId?: string;
  candidateName?: string;
  jobTitle?: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// IN-MEMORY STORAGE (can be migrated to database later)
// =============================================================================

// Store notifications in memory, keyed by tenant
const notificationStore: Map<string, Notification[]> = new Map();
let notificationIdCounter = 0;

function generateId(): string {
  notificationIdCounter++;
  return `notif_${Date.now()}_${notificationIdCounter}`;
}

function getNotificationsForTenant(tenantId: string): Notification[] {
  if (!notificationStore.has(tenantId)) {
    notificationStore.set(tenantId, []);
  }
  return notificationStore.get(tenantId)!;
}

// =============================================================================
// SERVICE
// =============================================================================

export class NotificationService {
  private tenantId: string;

  constructor(tenantId: string = 'development') {
    this.tenantId = tenantId;
  }

  /**
   * Create a new notification
   */
  async create(input: CreateNotificationInput): Promise<Notification> {
    const notification: Notification = {
      id: generateId(),
      type: input.type,
      title: input.title,
      message: input.message,
      trackerId: input.trackerId,
      conversationId: input.conversationId,
      candidateName: input.candidateName,
      jobTitle: input.jobTitle,
      read: false,
      createdAt: new Date(),
      tenantId: input.tenantId || this.tenantId,
    };

    const notifications = getNotificationsForTenant(notification.tenantId);
    notifications.unshift(notification); // Add to beginning (newest first)

    // Keep only last 100 notifications per tenant
    if (notifications.length > 100) {
      notifications.splice(100);
    }

    console.log('[NotificationService] Created notification:', notification.title);

    // Emit event for real-time SSE subscribers
    notificationEvents.emit('notification', notification);
    notificationEvents.emit(`notification:${notification.tenantId}`, notification);

    // Special events for high-priority notifications
    if (notification.type === 'ESCALATION_NEEDED') {
      notificationEvents.emit('escalation', notification);
      notificationEvents.emit(`escalation:${notification.tenantId}`, notification);
    }

    return notification;
  }

  /**
   * Create notification for connection acceptance
   */
  async notifyConnectionAccepted(data: {
    trackerId: string;
    candidateName?: string;
    jobTitle?: string;
    tenantId?: string;
  }): Promise<Notification> {
    return this.create({
      type: 'CONNECTION_ACCEPTED',
      title: `${data.candidateName || 'A candidate'} accepted your connection`,
      message: data.jobTitle ? `For role: ${data.jobTitle}` : undefined,
      trackerId: data.trackerId,
      candidateName: data.candidateName,
      jobTitle: data.jobTitle,
      tenantId: data.tenantId,
    });
  }

  /**
   * Create notification for pitch sent
   */
  async notifyPitchSent(data: {
    trackerId: string;
    conversationId: string;
    candidateName?: string;
    jobTitle?: string;
    tenantId?: string;
  }): Promise<Notification> {
    return this.create({
      type: 'PITCH_SENT',
      title: `Pitch sent to ${data.candidateName || 'candidate'}`,
      message: data.jobTitle ? `For role: ${data.jobTitle}` : undefined,
      trackerId: data.trackerId,
      conversationId: data.conversationId,
      candidateName: data.candidateName,
      jobTitle: data.jobTitle,
      tenantId: data.tenantId,
    });
  }

  /**
   * Create notification for candidate reply
   */
  async notifyCandidateReplied(data: {
    conversationId: string;
    candidateName?: string;
    jobTitle?: string;
    tenantId?: string;
  }): Promise<Notification> {
    return this.create({
      type: 'CANDIDATE_REPLIED',
      title: `${data.candidateName || 'A candidate'} replied to your message`,
      message: data.jobTitle ? `For role: ${data.jobTitle}` : undefined,
      conversationId: data.conversationId,
      candidateName: data.candidateName,
      jobTitle: data.jobTitle,
      tenantId: data.tenantId,
    });
  }

  /**
   * Create notification for follow-up due
   */
  async notifyFollowUpDue(data: {
    trackerId: string;
    candidateName?: string;
    jobTitle?: string;
    tenantId?: string;
  }): Promise<Notification> {
    return this.create({
      type: 'FOLLOW_UP_DUE',
      title: `Follow-up due for ${data.candidateName || 'a candidate'}`,
      message: data.jobTitle ? `For role: ${data.jobTitle}` : undefined,
      trackerId: data.trackerId,
      candidateName: data.candidateName,
      jobTitle: data.jobTitle,
      tenantId: data.tenantId,
    });
  }

  /**
   * Create notification for escalation needed (high priority)
   */
  async notifyEscalationNeeded(data: {
    conversationId: string;
    candidateName?: string;
    reason: string;
    jobTitle?: string;
    tenantId?: string;
  }): Promise<Notification> {
    return this.create({
      type: 'ESCALATION_NEEDED',
      title: `⚠️ Escalation: ${data.candidateName || 'Candidate'} needs attention`,
      message: data.reason,
      conversationId: data.conversationId,
      candidateName: data.candidateName,
      jobTitle: data.jobTitle,
      tenantId: data.tenantId,
    });
  }

  /**
   * Create notification for booking confirmation
   */
  async notifyBookingConfirmed(data: {
    assignmentId: string;
    candidateName?: string;
    recruiterName?: string;
    eventStartTime?: Date;
    tenantId?: string;
  }): Promise<Notification> {
    const timeStr = data.eventStartTime
      ? ` scheduled for ${data.eventStartTime.toLocaleString()}`
      : '';
    return this.create({
      type: 'BOOKING_CONFIRMED',
      title: `🎉 Call booked with ${data.candidateName || 'candidate'}`,
      message: data.recruiterName
        ? `${data.recruiterName}${timeStr}`
        : timeStr || undefined,
      candidateName: data.candidateName,
      tenantId: data.tenantId,
    });
  }

  /**
   * Get all notifications for tenant
   */
  async getAll(limit?: number): Promise<Notification[]> {
    const notifications = getNotificationsForTenant(this.tenantId);
    return limit ? notifications.slice(0, limit) : notifications;
  }

  /**
   * Get unread notifications
   */
  async getUnread(): Promise<Notification[]> {
    const notifications = getNotificationsForTenant(this.tenantId);
    return notifications.filter((n) => !n.read);
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    const unread = await this.getUnread();
    return unread.length;
  }

  /**
   * Mark notification as read
   */
  async markRead(id: string): Promise<Notification | null> {
    const notifications = getNotificationsForTenant(this.tenantId);
    const notification = notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
    }
    return notification || null;
  }

  /**
   * Mark all notifications as read
   */
  async markAllRead(): Promise<number> {
    const notifications = getNotificationsForTenant(this.tenantId);
    let count = 0;
    for (const notification of notifications) {
      if (!notification.read) {
        notification.read = true;
        count++;
      }
    }
    return count;
  }

  /**
   * Delete a notification
   */
  async delete(id: string): Promise<boolean> {
    const notifications = getNotificationsForTenant(this.tenantId);
    const index = notifications.findIndex((n) => n.id === id);
    if (index !== -1) {
      notifications.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clear all notifications
   */
  async clearAll(): Promise<number> {
    const notifications = getNotificationsForTenant(this.tenantId);
    const count = notifications.length;
    notifications.length = 0;
    return count;
  }

  /**
   * Get notifications by type
   */
  async getByType(type: NotificationType, limit?: number): Promise<Notification[]> {
    const notifications = getNotificationsForTenant(this.tenantId);
    const filtered = notifications.filter((n) => n.type === type);
    return limit ? filtered.slice(0, limit) : filtered;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

const instances: Map<string, NotificationService> = new Map();

export function getNotificationService(tenantId: string = 'development'): NotificationService {
  if (!instances.has(tenantId)) {
    instances.set(tenantId, new NotificationService(tenantId));
  }
  return instances.get(tenantId)!;
}

// Default instance for development
export const notificationService = getNotificationService('development');
