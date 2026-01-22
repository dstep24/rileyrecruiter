/**
 * Email Integration Module
 *
 * Two email client types:
 *
 * 1. EmailClient (OAuth-based)
 *    - Gmail (Google Workspace)
 *    - Outlook (Microsoft 365)
 *    - For reading/sending from user's own mailbox
 *
 * 2. ResendClient (Transactional)
 *    - Resend API for cold outreach
 *    - 3,000 free emails/month
 *    - Webhook-based delivery tracking
 *
 * Features:
 * - Send/receive emails
 * - Thread management
 * - Open/click tracking
 * - Scheduled sending
 */

// OAuth-based Email Client (Gmail/Outlook)
export {
  EmailClient,
  EmailConfig,
  OAuthCredentials,
  EmailMessage,
  EmailAddress,
  EmailAttachment,
  EmailStatus,
  EmailThread,
  SendEmailRequest,
  EmailSearchQuery,
  initializeEmailClient,
  getEmailClient,
} from './EmailClient.js';

// Transactional Email Types
export type {
  TransactionalEmailConfig,
  SendTransactionalEmailParams,
  SendEmailResult,
  EmailStatusUpdate,
  TransactionalEmailStatus,
  ResendWebhookPayload,
  ResendWebhookEventType,
  EmailTemplate,
  RenderTemplateParams,
  EmailAnalytics,
  EmailTag,
  ITransactionalEmailClient,
} from './TransactionalTypes.js';

// Resend Client (Transactional Email)
export {
  ResendClient,
  initializeResendClient,
  getResendClient,
  isResendConfigured,
  initializeResendClientFromEnv,
} from './ResendClient.js';
