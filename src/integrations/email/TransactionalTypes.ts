/**
 * Transactional Email Types
 *
 * Types for transactional/marketing email sending via services like Resend.
 * Separate from OAuth-based EmailClient which handles Gmail/Outlook integration.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface TransactionalEmailConfig {
  /** API key for the email provider */
  apiKey: string;
  /** Default from email address */
  fromEmail: string;
  /** Default from name */
  fromName: string;
  /** Reply-to email address */
  replyTo?: string;
  /** Webhook signing secret (for verifying webhook payloads) */
  webhookSecret?: string;
}

// =============================================================================
// SEND TYPES
// =============================================================================

export interface SendTransactionalEmailParams {
  /** Recipient email address */
  to: string;
  /** Email subject line */
  subject: string;
  /** HTML body content */
  html: string;
  /** Plain text body (optional, auto-generated from HTML if not provided) */
  text?: string;
  /** Override from email */
  from?: string;
  /** Override from name */
  fromName?: string;
  /** Override reply-to */
  replyTo?: string;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Tags for categorization and analytics */
  tags?: EmailTag[];
  /** Schedule send time (ISO 8601) */
  scheduledAt?: string;
}

export interface EmailTag {
  name: string;
  value: string;
}

export interface SendEmailResult {
  /** Unique message ID from the provider */
  messageId: string;
  /** Initial status */
  status: TransactionalEmailStatus;
  /** Provider-specific metadata */
  metadata?: Record<string, unknown>;
}

// =============================================================================
// STATUS TYPES
// =============================================================================

export type TransactionalEmailStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'bounced'
  | 'complained'
  | 'unsubscribed'
  | 'failed';

export interface EmailStatusUpdate {
  messageId: string;
  status: TransactionalEmailStatus;
  timestamp: Date;
  recipient: string;
  metadata?: {
    /** For bounces */
    bounceType?: 'hard' | 'soft';
    bounceReason?: string;
    /** For clicks */
    clickedUrl?: string;
    /** User agent info */
    userAgent?: string;
    /** IP address */
    ipAddress?: string;
  };
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

export type ResendWebhookEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.complained'
  | 'email.bounced'
  | 'email.opened'
  | 'email.clicked';

export interface ResendWebhookPayload {
  type: ResendWebhookEventType;
  created_at: string;
  data: {
    created_at: string;
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    // Event-specific data
    click?: {
      link: string;
      timestamp: string;
      userAgent: string;
      ipAddress: string;
    };
    bounce?: {
      message: string;
    };
  };
}

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  htmlTemplate: string;
  textTemplate?: string;
  variables: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface RenderTemplateParams {
  templateId: string;
  variables: Record<string, string>;
}

// =============================================================================
// ANALYTICS TYPES
// =============================================================================

export interface EmailAnalytics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
}

// =============================================================================
// INTERFACE
// =============================================================================

export interface ITransactionalEmailClient {
  /**
   * Send a transactional email
   */
  send(params: SendTransactionalEmailParams): Promise<SendEmailResult>;

  /**
   * Get status of a sent email
   */
  getStatus(messageId: string): Promise<EmailStatusUpdate | null>;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): boolean;

  /**
   * Parse webhook payload
   */
  parseWebhook(payload: ResendWebhookPayload): EmailStatusUpdate;
}
