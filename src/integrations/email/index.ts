/**
 * Email Integration Module
 *
 * Unified interface for email providers:
 * - Gmail (Google Workspace)
 * - Outlook (Microsoft 365)
 *
 * Features:
 * - Send/receive emails
 * - Thread management
 * - Open/click tracking
 * - Scheduled sending
 */

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
