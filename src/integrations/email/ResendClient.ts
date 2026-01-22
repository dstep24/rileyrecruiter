/**
 * Resend Email Client
 *
 * Transactional email sending via Resend API.
 * Used for cold outreach emails to candidates sourced from GitHub.
 *
 * Pricing:
 * - Free tier: 3,000 emails/month
 * - No credit card required
 *
 * API Docs: https://resend.com/docs
 */

import { Resend } from 'resend';
import * as crypto from 'crypto';
import type {
  TransactionalEmailConfig,
  SendTransactionalEmailParams,
  SendEmailResult,
  EmailStatusUpdate,
  TransactionalEmailStatus,
  ResendWebhookPayload,
  ResendWebhookEventType,
  ITransactionalEmailClient,
} from './TransactionalTypes.js';

// =============================================================================
// RESEND CLIENT
// =============================================================================

export class ResendClient implements ITransactionalEmailClient {
  private client: Resend;
  private config: TransactionalEmailConfig;

  constructor(config: TransactionalEmailConfig) {
    this.config = config;
    this.client = new Resend(config.apiKey);
  }

  /**
   * Send a transactional email via Resend
   */
  async send(params: SendTransactionalEmailParams): Promise<SendEmailResult> {
    const from = this.formatFromAddress(
      params.from || this.config.fromEmail,
      params.fromName || this.config.fromName
    );

    console.log(`[ResendClient] Sending email to ${params.to}: "${params.subject}"`);

    try {
      const response = await this.client.emails.send({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo || this.config.replyTo,
        headers: params.headers,
        tags: params.tags?.map((t) => ({ name: t.name, value: t.value })),
        scheduledAt: params.scheduledAt,
      });

      if (response.error) {
        console.error('[ResendClient] Send failed:', response.error);
        throw new Error(`Resend API error: ${response.error.message}`);
      }

      console.log(`[ResendClient] Email sent successfully, ID: ${response.data?.id}`);

      return {
        messageId: response.data?.id || '',
        status: 'queued',
        metadata: {
          provider: 'resend',
        },
      };
    } catch (error) {
      console.error('[ResendClient] Send error:', error);
      throw error;
    }
  }

  /**
   * Get status of a sent email
   * Note: Resend doesn't have a direct status endpoint, so we rely on webhooks
   */
  async getStatus(messageId: string): Promise<EmailStatusUpdate | null> {
    try {
      const response = await this.client.emails.get(messageId);

      if (response.error) {
        console.error('[ResendClient] Get status failed:', response.error);
        return null;
      }

      const data = response.data;
      if (!data) return null;

      // Map Resend status to our status type
      const status = this.mapResendStatus(data.last_event as string);

      return {
        messageId: data.id,
        status,
        timestamp: new Date(data.created_at),
        recipient: Array.isArray(data.to) ? data.to[0] : data.to,
      };
    } catch (error) {
      console.error('[ResendClient] Get status error:', error);
      return null;
    }
  }

  /**
   * Verify webhook signature from Resend
   */
  verifyWebhook(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      console.warn('[ResendClient] Webhook secret not configured, skipping verification');
      return true;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse webhook payload into EmailStatusUpdate
   */
  parseWebhook(payload: ResendWebhookPayload): EmailStatusUpdate {
    const status = this.mapWebhookEventToStatus(payload.type);

    const update: EmailStatusUpdate = {
      messageId: payload.data.email_id,
      status,
      timestamp: new Date(payload.created_at),
      recipient: payload.data.to[0],
    };

    // Add event-specific metadata
    if (payload.data.click) {
      update.metadata = {
        clickedUrl: payload.data.click.link,
        userAgent: payload.data.click.userAgent,
        ipAddress: payload.data.click.ipAddress,
      };
    }

    if (payload.data.bounce) {
      update.metadata = {
        bounceType: 'hard',
        bounceReason: payload.data.bounce.message,
      };
    }

    return update;
  }

  /**
   * Map Resend API status to our status type
   */
  private mapResendStatus(resendStatus: string): TransactionalEmailStatus {
    const statusMap: Record<string, TransactionalEmailStatus> = {
      queued: 'queued',
      sent: 'sent',
      delivered: 'delivered',
      opened: 'opened',
      clicked: 'clicked',
      bounced: 'bounced',
      complained: 'complained',
    };

    return statusMap[resendStatus?.toLowerCase()] || 'queued';
  }

  /**
   * Map webhook event type to status
   */
  private mapWebhookEventToStatus(eventType: ResendWebhookEventType): TransactionalEmailStatus {
    const eventMap: Record<ResendWebhookEventType, TransactionalEmailStatus> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'queued',
      'email.complained': 'complained',
      'email.bounced': 'bounced',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
    };

    return eventMap[eventType] || 'queued';
  }

  /**
   * Format from address as "Name <email>"
   */
  private formatFromAddress(email: string, name?: string): string {
    if (name) {
      return `${name} <${email}>`;
    }
    return email;
  }

  /**
   * Send a batch of emails
   */
  async sendBatch(
    emails: SendTransactionalEmailParams[],
    options?: {
      onProgress?: (sent: number, total: number) => void;
      delayMs?: number;
    }
  ): Promise<Map<string, SendEmailResult>> {
    const results = new Map<string, SendEmailResult>();
    const delay = options?.delayMs || 100; // Small delay between sends

    for (let i = 0; i < emails.length; i++) {
      const email = emails[i];
      try {
        const result = await this.send(email);
        results.set(email.to, result);
      } catch (error) {
        console.error(`[ResendClient] Batch send failed for ${email.to}:`, error);
        results.set(email.to, {
          messageId: '',
          status: 'failed',
          metadata: { error: String(error) },
        });
      }

      options?.onProgress?.(i + 1, emails.length);

      // Rate limiting delay
      if (i < emails.length - 1) {
        await this.delay(delay);
      }
    }

    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let resendInstance: ResendClient | null = null;

export function initializeResendClient(config: TransactionalEmailConfig): ResendClient {
  resendInstance = new ResendClient(config);
  return resendInstance;
}

export function getResendClient(): ResendClient {
  if (!resendInstance) {
    throw new Error('ResendClient not initialized. Call initializeResendClient first.');
  }
  return resendInstance;
}

/**
 * Check if Resend is configured
 */
export function isResendConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM_ADDRESS);
}

/**
 * Initialize Resend client from environment variables
 */
export function initializeResendClientFromEnv(): ResendClient | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.EMAIL_FROM_ADDRESS;
  const fromName = process.env.EMAIL_FROM_NAME || 'Riley Recruiting';
  const replyTo = process.env.EMAIL_REPLY_TO;
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;

  if (!apiKey || !fromEmail) {
    console.log('[ResendClient] RESEND_API_KEY or EMAIL_FROM_ADDRESS not configured, email outreach disabled');
    return null;
  }

  return initializeResendClient({
    apiKey,
    fromEmail,
    fromName,
    replyTo,
    webhookSecret,
  });
}
