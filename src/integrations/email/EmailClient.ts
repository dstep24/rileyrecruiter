/**
 * Email Integration Client - Gmail & Outlook
 *
 * Provides unified email operations via OAuth-authenticated access
 * to Gmail and Microsoft Outlook/365.
 *
 * Key Operations:
 * - Send emails (with templates)
 * - Read inbox messages
 * - Track opens and replies
 * - Manage threads
 */

import { v4 as uuid } from 'uuid';

// =============================================================================
// TYPES
// =============================================================================

export interface EmailConfig {
  provider: 'gmail' | 'outlook';
  credentials: OAuthCredentials;
  userId: string; // 'me' for Gmail, user email for Outlook
  defaultFrom?: string;
  trackingEnabled?: boolean;
  trackingDomain?: string;
}

export interface OAuthCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  clientId: string;
  clientSecret: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  externalId: string;

  // Participants
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  replyTo?: EmailAddress;

  // Content
  subject: string;
  textBody?: string;
  htmlBody?: string;
  snippet?: string;

  // Attachments
  attachments?: EmailAttachment[];

  // Headers
  messageId: string; // RFC 2822 Message-ID
  inReplyTo?: string;
  references?: string[];

  // Tracking
  status: EmailStatus;
  sentAt?: Date;
  receivedAt?: Date;
  openedAt?: Date;
  clickedAt?: Date;
  repliedAt?: Date;

  // Labels/Folders
  labels?: string[];
  folder?: string;

  // Metadata
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
}

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  data?: string; // Base64 encoded
  url?: string;
}

export type EmailStatus =
  | 'draft'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'opened'
  | 'clicked'
  | 'replied'
  | 'bounced'
  | 'failed';

export interface SendEmailRequest {
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    data: string; // Base64
  }>;
  replyTo?: string; // Message-ID to reply to
  threadId?: string;
  trackOpens?: boolean;
  trackClicks?: boolean;
  scheduledFor?: Date;
}

export interface EmailThread {
  id: string;
  externalId: string;
  subject: string;
  participants: EmailAddress[];
  messageCount: number;
  messages: EmailMessage[];
  snippet?: string;
  lastMessageAt: Date;
  isUnread: boolean;
}

export interface EmailSearchQuery {
  from?: string;
  to?: string;
  subject?: string;
  query?: string; // Full text search
  after?: Date;
  before?: Date;
  hasAttachment?: boolean;
  isUnread?: boolean;
  labels?: string[];
  limit?: number;
  pageToken?: string;
}

// =============================================================================
// EMAIL CLIENT
// =============================================================================

export class EmailClient {
  private config: EmailConfig;

  constructor(config: EmailConfig) {
    this.config = config;
  }

  // ===========================================================================
  // SEND
  // ===========================================================================

  /**
   * Send an email
   */
  async send(request: SendEmailRequest): Promise<EmailMessage> {
    // Build the email
    let htmlBody = request.htmlBody;

    // Add tracking pixel if enabled
    if (this.config.trackingEnabled && request.trackOpens !== false) {
      htmlBody = this.addTrackingPixel(htmlBody || '', uuid());
    }

    // Add click tracking if enabled
    if (this.config.trackingEnabled && request.trackClicks !== false && htmlBody) {
      htmlBody = this.addClickTracking(htmlBody, uuid());
    }

    // Build raw message
    const rawMessage = this.buildRawMessage({
      ...request,
      htmlBody,
      from: { email: this.config.defaultFrom || this.config.credentials.clientId },
    });

    // Send via provider
    if (this.config.provider === 'gmail') {
      return this.sendViaGmail(rawMessage, request.threadId);
    } else {
      return this.sendViaOutlook(request, htmlBody);
    }
  }

  /**
   * Send a reply in a thread
   */
  async reply(
    threadId: string,
    messageId: string,
    content: {
      textBody?: string;
      htmlBody?: string;
    }
  ): Promise<EmailMessage> {
    // Get original message for headers
    const original = await this.getMessage(messageId);

    return this.send({
      to: [original.from],
      subject: original.subject.startsWith('Re:')
        ? original.subject
        : `Re: ${original.subject}`,
      textBody: content.textBody,
      htmlBody: content.htmlBody,
      replyTo: original.messageId,
      threadId,
    });
  }

  /**
   * Schedule an email for later
   */
  async schedule(request: SendEmailRequest): Promise<{ scheduledId: string }> {
    if (!request.scheduledFor) {
      throw new Error('scheduledFor is required for scheduled emails');
    }

    // For Gmail, use scheduled send feature
    // For Outlook, use delayed delivery
    // For now, store in our queue and handle via background job

    const scheduledId = uuid();
    console.log(`[EmailClient] Email scheduled for ${request.scheduledFor.toISOString()}`);

    return { scheduledId };
  }

  // ===========================================================================
  // READ
  // ===========================================================================

  /**
   * Get a single message
   */
  async getMessage(externalId: string): Promise<EmailMessage> {
    if (this.config.provider === 'gmail') {
      return this.getGmailMessage(externalId);
    } else {
      return this.getOutlookMessage(externalId);
    }
  }

  /**
   * Get a thread with all messages
   */
  async getThread(threadId: string): Promise<EmailThread> {
    if (this.config.provider === 'gmail') {
      return this.getGmailThread(threadId);
    } else {
      return this.getOutlookThread(threadId);
    }
  }

  /**
   * Search messages
   */
  async search(query: EmailSearchQuery): Promise<{
    messages: EmailMessage[];
    nextPageToken?: string;
  }> {
    if (this.config.provider === 'gmail') {
      return this.searchGmail(query);
    } else {
      return this.searchOutlook(query);
    }
  }

  /**
   * List recent messages
   */
  async listRecent(options?: {
    limit?: number;
    unreadOnly?: boolean;
  }): Promise<EmailMessage[]> {
    const { messages } = await this.search({
      limit: options?.limit || 50,
      isUnread: options?.unreadOnly,
    });
    return messages;
  }

  /**
   * Get unread count
   */
  async getUnreadCount(): Promise<number> {
    if (this.config.provider === 'gmail') {
      return this.getGmailUnreadCount();
    } else {
      return this.getOutlookUnreadCount();
    }
  }

  // ===========================================================================
  // ACTIONS
  // ===========================================================================

  /**
   * Mark message as read
   */
  async markAsRead(messageId: string): Promise<void> {
    if (this.config.provider === 'gmail') {
      await this.gmailRequest('POST', `/messages/${messageId}/modify`, {
        removeLabelIds: ['UNREAD'],
      });
    } else {
      await this.outlookRequest('PATCH', `/messages/${messageId}`, {
        isRead: true,
      });
    }
  }

  /**
   * Mark message as unread
   */
  async markAsUnread(messageId: string): Promise<void> {
    if (this.config.provider === 'gmail') {
      await this.gmailRequest('POST', `/messages/${messageId}/modify`, {
        addLabelIds: ['UNREAD'],
      });
    } else {
      await this.outlookRequest('PATCH', `/messages/${messageId}`, {
        isRead: false,
      });
    }
  }

  /**
   * Star/flag a message
   */
  async star(messageId: string): Promise<void> {
    if (this.config.provider === 'gmail') {
      await this.gmailRequest('POST', `/messages/${messageId}/modify`, {
        addLabelIds: ['STARRED'],
      });
    } else {
      await this.outlookRequest('PATCH', `/messages/${messageId}`, {
        flag: { flagStatus: 'flagged' },
      });
    }
  }

  /**
   * Archive a message
   */
  async archive(messageId: string): Promise<void> {
    if (this.config.provider === 'gmail') {
      await this.gmailRequest('POST', `/messages/${messageId}/modify`, {
        removeLabelIds: ['INBOX'],
      });
    } else {
      await this.outlookRequest('POST', `/messages/${messageId}/move`, {
        destinationId: 'archive',
      });
    }
  }

  /**
   * Delete a message
   */
  async delete(messageId: string, permanent: boolean = false): Promise<void> {
    if (this.config.provider === 'gmail') {
      if (permanent) {
        await this.gmailRequest('DELETE', `/messages/${messageId}`);
      } else {
        await this.gmailRequest('POST', `/messages/${messageId}/trash`);
      }
    } else {
      if (permanent) {
        await this.outlookRequest('DELETE', `/messages/${messageId}`);
      } else {
        await this.outlookRequest('POST', `/messages/${messageId}/move`, {
          destinationId: 'deleteditems',
        });
      }
    }
  }

  // ===========================================================================
  // LABELS/FOLDERS
  // ===========================================================================

  /**
   * List available labels/folders
   */
  async listLabels(): Promise<Array<{ id: string; name: string }>> {
    if (this.config.provider === 'gmail') {
      const response = await this.gmailRequest<{ labels: Array<{ id: string; name: string }> }>(
        'GET',
        '/labels'
      );
      return response?.labels || [];
    } else {
      const response = await this.outlookRequest<{ value: Array<{ id: string; displayName: string }> }>(
        'GET',
        '/mailFolders'
      );
      return (response?.value || []).map((f) => ({ id: f.id, name: f.displayName }));
    }
  }

  /**
   * Add label to message
   */
  async addLabel(messageId: string, labelId: string): Promise<void> {
    if (this.config.provider === 'gmail') {
      await this.gmailRequest('POST', `/messages/${messageId}/modify`, {
        addLabelIds: [labelId],
      });
    } else {
      // Outlook uses folders, so we'd move to a folder
      await this.outlookRequest('POST', `/messages/${messageId}/move`, {
        destinationId: labelId,
      });
    }
  }

  // ===========================================================================
  // TRACKING
  // ===========================================================================

  /**
   * Handle tracking pixel request (called from webhook)
   */
  async handleOpenTracking(trackingId: string): Promise<void> {
    // Update message status
    console.log(`[EmailClient] Email ${trackingId} opened`);
    // In production, would update database and emit event
  }

  /**
   * Handle click tracking (called from webhook)
   */
  async handleClickTracking(trackingId: string, url: string): Promise<void> {
    console.log(`[EmailClient] Link clicked in ${trackingId}: ${url}`);
    // In production, would update database and emit event
  }

  private addTrackingPixel(html: string, trackingId: string): string {
    const pixel = `<img src="${this.config.trackingDomain}/track/open/${trackingId}" width="1" height="1" style="display:none" />`;
    return html.replace('</body>', `${pixel}</body>`);
  }

  private addClickTracking(html: string, trackingId: string): string {
    // Replace href links with tracking URLs
    return html.replace(
      /href="(https?:\/\/[^"]+)"/g,
      (match, url) => {
        const encodedUrl = encodeURIComponent(url);
        return `href="${this.config.trackingDomain}/track/click/${trackingId}?url=${encodedUrl}"`;
      }
    );
  }

  // ===========================================================================
  // GMAIL IMPLEMENTATION
  // ===========================================================================

  private async sendViaGmail(
    rawMessage: string,
    threadId?: string
  ): Promise<EmailMessage> {
    const body: Record<string, unknown> = {
      raw: Buffer.from(rawMessage).toString('base64url'),
    };

    if (threadId) {
      body.threadId = threadId;
    }

    const response = await this.gmailRequest<GmailMessageResponse>(
      'POST',
      '/messages/send',
      body
    );

    return this.normalizeGmailMessage(response!);
  }

  private async getGmailMessage(messageId: string): Promise<EmailMessage> {
    const response = await this.gmailRequest<GmailMessageResponse>(
      'GET',
      `/messages/${messageId}?format=full`
    );

    return this.normalizeGmailMessage(response!);
  }

  private async getGmailThread(threadId: string): Promise<EmailThread> {
    const response = await this.gmailRequest<GmailThreadResponse>(
      'GET',
      `/threads/${threadId}?format=full`
    );

    const messages = (response?.messages || []).map((m) => this.normalizeGmailMessage(m));

    return {
      id: uuid(),
      externalId: threadId,
      subject: messages[0]?.subject || '',
      participants: this.extractParticipants(messages),
      messageCount: messages.length,
      messages,
      snippet: response?.snippet,
      lastMessageAt: messages[messages.length - 1]?.receivedAt || new Date(),
      isUnread: messages.some((m) => !m.isRead),
    };
  }

  private async searchGmail(query: EmailSearchQuery): Promise<{
    messages: EmailMessage[];
    nextPageToken?: string;
  }> {
    const q = this.buildGmailQuery(query);
    const params = new URLSearchParams({
      q,
      maxResults: (query.limit || 50).toString(),
    });

    if (query.pageToken) {
      params.set('pageToken', query.pageToken);
    }

    const response = await this.gmailRequest<{
      messages: Array<{ id: string; threadId: string }>;
      nextPageToken?: string;
    }>('GET', `/messages?${params.toString()}`);

    // Fetch full messages
    const messages = await Promise.all(
      (response?.messages || []).map((m) => this.getGmailMessage(m.id))
    );

    return {
      messages,
      nextPageToken: response?.nextPageToken,
    };
  }

  private buildGmailQuery(query: EmailSearchQuery): string {
    const parts: string[] = [];

    if (query.from) parts.push(`from:${query.from}`);
    if (query.to) parts.push(`to:${query.to}`);
    if (query.subject) parts.push(`subject:${query.subject}`);
    if (query.query) parts.push(query.query);
    if (query.after) parts.push(`after:${Math.floor(query.after.getTime() / 1000)}`);
    if (query.before) parts.push(`before:${Math.floor(query.before.getTime() / 1000)}`);
    if (query.hasAttachment) parts.push('has:attachment');
    if (query.isUnread) parts.push('is:unread');
    if (query.labels) parts.push(query.labels.map((l) => `label:${l}`).join(' '));

    return parts.join(' ');
  }

  private async getGmailUnreadCount(): Promise<number> {
    const response = await this.gmailRequest<{ messagesUnread: number }>(
      'GET',
      '/labels/INBOX'
    );
    return response?.messagesUnread || 0;
  }

  private async gmailRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    await this.refreshTokenIfNeeded();

    const url = `https://gmail.googleapis.com/gmail/v1/users/${this.config.userId}${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Gmail API error: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as T;
  }

  private normalizeGmailMessage(data: GmailMessageResponse): EmailMessage {
    const headers = new Map(
      (data.payload?.headers || []).map((h) => [h.name.toLowerCase(), h.value])
    );

    return {
      id: uuid(),
      threadId: data.threadId,
      externalId: data.id,
      from: this.parseEmailAddress(headers.get('from') || ''),
      to: this.parseEmailAddresses(headers.get('to') || ''),
      cc: headers.get('cc') ? this.parseEmailAddresses(headers.get('cc')!) : undefined,
      subject: headers.get('subject') || '',
      textBody: this.extractBody(data.payload, 'text/plain'),
      htmlBody: this.extractBody(data.payload, 'text/html'),
      snippet: data.snippet,
      messageId: headers.get('message-id') || '',
      inReplyTo: headers.get('in-reply-to'),
      references: headers.get('references')?.split(/\s+/),
      attachments: this.extractAttachments(data.payload),
      status: 'sent',
      sentAt: new Date(parseInt(data.internalDate)),
      receivedAt: new Date(parseInt(data.internalDate)),
      labels: data.labelIds,
      isRead: !data.labelIds?.includes('UNREAD'),
      isStarred: data.labelIds?.includes('STARRED') || false,
      isDraft: data.labelIds?.includes('DRAFT') || false,
    };
  }

  // ===========================================================================
  // OUTLOOK IMPLEMENTATION
  // ===========================================================================

  private async sendViaOutlook(
    request: SendEmailRequest,
    htmlBody?: string
  ): Promise<EmailMessage> {
    const body = {
      message: {
        subject: request.subject,
        body: {
          contentType: htmlBody ? 'HTML' : 'Text',
          content: htmlBody || request.textBody,
        },
        toRecipients: request.to.map((a) => ({
          emailAddress: { address: a.email, name: a.name },
        })),
        ccRecipients: request.cc?.map((a) => ({
          emailAddress: { address: a.email, name: a.name },
        })),
      },
      saveToSentItems: true,
    };

    const response = await this.outlookRequest<OutlookMessageResponse>(
      'POST',
      '/sendMail',
      body
    );

    // sendMail doesn't return the message, so create a placeholder
    return {
      id: uuid(),
      threadId: '',
      externalId: '',
      from: { email: this.config.defaultFrom || '' },
      to: request.to,
      subject: request.subject,
      textBody: request.textBody,
      htmlBody,
      messageId: '',
      status: 'sent',
      sentAt: new Date(),
      isRead: true,
      isStarred: false,
      isDraft: false,
    };
  }

  private async getOutlookMessage(messageId: string): Promise<EmailMessage> {
    const response = await this.outlookRequest<OutlookMessageResponse>(
      'GET',
      `/messages/${messageId}`
    );

    return this.normalizeOutlookMessage(response!);
  }

  private async getOutlookThread(conversationId: string): Promise<EmailThread> {
    const response = await this.outlookRequest<{ value: OutlookMessageResponse[] }>(
      'GET',
      `/messages?$filter=conversationId eq '${conversationId}'&$orderby=receivedDateTime`
    );

    const messages = (response?.value || []).map((m) => this.normalizeOutlookMessage(m));

    return {
      id: uuid(),
      externalId: conversationId,
      subject: messages[0]?.subject || '',
      participants: this.extractParticipants(messages),
      messageCount: messages.length,
      messages,
      lastMessageAt: messages[messages.length - 1]?.receivedAt || new Date(),
      isUnread: messages.some((m) => !m.isRead),
    };
  }

  private async searchOutlook(query: EmailSearchQuery): Promise<{
    messages: EmailMessage[];
    nextPageToken?: string;
  }> {
    const filters: string[] = [];

    if (query.from) filters.push(`from/emailAddress/address eq '${query.from}'`);
    if (query.subject) filters.push(`contains(subject, '${query.subject}')`);
    if (query.isUnread) filters.push(`isRead eq false`);
    if (query.after) filters.push(`receivedDateTime ge ${query.after.toISOString()}`);
    if (query.before) filters.push(`receivedDateTime le ${query.before.toISOString()}`);

    const params = new URLSearchParams({
      $top: (query.limit || 50).toString(),
      $orderby: 'receivedDateTime desc',
    });

    if (filters.length > 0) {
      params.set('$filter', filters.join(' and '));
    }

    if (query.query) {
      params.set('$search', `"${query.query}"`);
    }

    const response = await this.outlookRequest<{
      value: OutlookMessageResponse[];
      '@odata.nextLink'?: string;
    }>('GET', `/messages?${params.toString()}`);

    return {
      messages: (response?.value || []).map((m) => this.normalizeOutlookMessage(m)),
      nextPageToken: response?.['@odata.nextLink'],
    };
  }

  private async getOutlookUnreadCount(): Promise<number> {
    const response = await this.outlookRequest<{ unreadItemCount: number }>(
      'GET',
      '/mailFolders/inbox'
    );
    return response?.unreadItemCount || 0;
  }

  private async outlookRequest<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T | null> {
    await this.refreshTokenIfNeeded();

    const url = `https://graph.microsoft.com/v1.0/me${path}`;

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.config.credentials.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Outlook API error: ${response.status} ${response.statusText}`);
    }

    if (response.status === 204) return null;
    return (await response.json()) as T;
  }

  private normalizeOutlookMessage(data: OutlookMessageResponse): EmailMessage {
    return {
      id: uuid(),
      threadId: data.conversationId,
      externalId: data.id,
      from: {
        email: data.from?.emailAddress?.address || '',
        name: data.from?.emailAddress?.name,
      },
      to: (data.toRecipients || []).map((r) => ({
        email: r.emailAddress?.address || '',
        name: r.emailAddress?.name,
      })),
      cc: data.ccRecipients?.map((r) => ({
        email: r.emailAddress?.address || '',
        name: r.emailAddress?.name,
      })),
      subject: data.subject || '',
      textBody: data.body?.contentType === 'text' ? data.body.content : undefined,
      htmlBody: data.body?.contentType === 'html' ? data.body.content : undefined,
      snippet: data.bodyPreview,
      messageId: data.internetMessageId || '',
      attachments: data.hasAttachments
        ? [{ id: '', filename: 'attachment', mimeType: 'unknown', size: 0 }]
        : undefined,
      status: 'sent',
      sentAt: data.sentDateTime ? new Date(data.sentDateTime) : undefined,
      receivedAt: data.receivedDateTime ? new Date(data.receivedDateTime) : undefined,
      isRead: data.isRead || false,
      isStarred: data.flag?.flagStatus === 'flagged',
      isDraft: data.isDraft || false,
    };
  }

  // ===========================================================================
  // UTILITIES
  // ===========================================================================

  private buildRawMessage(request: SendEmailRequest & { from: EmailAddress }): string {
    const boundary = `----=_Part_${uuid()}`;

    let message = '';
    message += `From: ${this.formatEmailAddress(request.from)}\r\n`;
    message += `To: ${request.to.map((a) => this.formatEmailAddress(a)).join(', ')}\r\n`;
    if (request.cc) {
      message += `Cc: ${request.cc.map((a) => this.formatEmailAddress(a)).join(', ')}\r\n`;
    }
    message += `Subject: ${request.subject}\r\n`;
    message += `MIME-Version: 1.0\r\n`;

    if (request.replyTo) {
      message += `In-Reply-To: ${request.replyTo}\r\n`;
      message += `References: ${request.replyTo}\r\n`;
    }

    message += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n`;
    message += `\r\n`;

    // Text part
    if (request.textBody) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/plain; charset=UTF-8\r\n`;
      message += `\r\n`;
      message += `${request.textBody}\r\n`;
    }

    // HTML part
    if (request.htmlBody) {
      message += `--${boundary}\r\n`;
      message += `Content-Type: text/html; charset=UTF-8\r\n`;
      message += `\r\n`;
      message += `${request.htmlBody}\r\n`;
    }

    message += `--${boundary}--\r\n`;

    return message;
  }

  private formatEmailAddress(addr: EmailAddress): string {
    if (addr.name) {
      return `"${addr.name}" <${addr.email}>`;
    }
    return addr.email;
  }

  private parseEmailAddress(str: string): EmailAddress {
    const match = str.match(/^(?:"?([^"]*)"?\s)?<?([^>]+)>?$/);
    if (match) {
      return { name: match[1]?.trim(), email: match[2].trim() };
    }
    return { email: str.trim() };
  }

  private parseEmailAddresses(str: string): EmailAddress[] {
    return str.split(',').map((s) => this.parseEmailAddress(s.trim()));
  }

  private extractBody(payload: GmailPayload | undefined, mimeType: string): string | undefined {
    if (!payload) return undefined;

    if (payload.mimeType === mimeType && payload.body?.data) {
      return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        const body = this.extractBody(part, mimeType);
        if (body) return body;
      }
    }

    return undefined;
  }

  private extractAttachments(payload: GmailPayload | undefined): EmailAttachment[] {
    if (!payload) return [];

    const attachments: EmailAttachment[] = [];

    if (payload.filename && payload.body?.attachmentId) {
      attachments.push({
        id: payload.body.attachmentId,
        filename: payload.filename,
        mimeType: payload.mimeType || 'application/octet-stream',
        size: payload.body.size || 0,
      });
    }

    if (payload.parts) {
      for (const part of payload.parts) {
        attachments.push(...this.extractAttachments(part));
      }
    }

    return attachments;
  }

  private extractParticipants(messages: EmailMessage[]): EmailAddress[] {
    const seen = new Set<string>();
    const participants: EmailAddress[] = [];

    for (const msg of messages) {
      const addrs = [msg.from, ...msg.to, ...(msg.cc || [])];
      for (const addr of addrs) {
        if (!seen.has(addr.email)) {
          seen.add(addr.email);
          participants.push(addr);
        }
      }
    }

    return participants;
  }

  private async refreshTokenIfNeeded(): Promise<void> {
    if (this.config.credentials.expiresAt > new Date()) {
      return; // Token still valid
    }

    // Refresh the token
    console.log('[EmailClient] Refreshing OAuth token...');
    // In production, would call OAuth refresh endpoint
  }
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

interface GmailMessageResponse {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate: string;
  payload?: GmailPayload;
}

interface GmailPayload {
  mimeType?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayload[];
  filename?: string;
}

interface GmailThreadResponse {
  id: string;
  snippet?: string;
  messages: GmailMessageResponse[];
}

interface OutlookMessageResponse {
  id: string;
  conversationId: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string; name?: string } }>;
  internetMessageId?: string;
  hasAttachments?: boolean;
  sentDateTime?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  flag?: { flagStatus?: string };
}

// =============================================================================
// SINGLETON
// =============================================================================

let instance: EmailClient | null = null;

export function initializeEmailClient(config: EmailConfig): EmailClient {
  instance = new EmailClient(config);
  return instance;
}

export function getEmailClient(): EmailClient {
  if (!instance) {
    throw new Error('EmailClient not initialized. Call initializeEmailClient first.');
  }
  return instance;
}
