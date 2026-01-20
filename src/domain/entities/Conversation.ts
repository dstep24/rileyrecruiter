/**
 * Conversation - Communication thread with a candidate
 *
 * Tracks all messages exchanged across channels (email, LinkedIn, SMS).
 * Intent classification helps route conversations appropriately.
 */

// =============================================================================
// CHANNEL AND STATUS
// =============================================================================

export type Channel = 'EMAIL' | 'LINKEDIN' | 'SMS' | 'PHONE' | 'IN_APP';

export type ConversationStatus = 'ACTIVE' | 'WAITING_RESPONSE' | 'COMPLETED' | 'ARCHIVED';

// =============================================================================
// MESSAGES
// =============================================================================

export type MessageDirection = 'INBOUND' | 'OUTBOUND';

export type SenderType = 'CANDIDATE' | 'AGENT' | 'TELEOPERATOR';

export interface Message {
  id: string;
  conversationId: string;

  // Message content
  direction: MessageDirection;
  content: string;
  contentType: 'text' | 'html' | 'markdown';

  // Metadata
  senderType: SenderType;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;

  // For outbound messages
  taskId?: string;

  // Email-specific
  subject?: string;
  inReplyTo?: string;
  references?: string[];

  // Attachments
  attachments?: MessageAttachment[];

  createdAt: Date;
}

export interface MessageAttachment {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}

// =============================================================================
// INTENT CLASSIFICATION
// =============================================================================

export type ConversationIntent =
  | 'interested' // Candidate is interested
  | 'not_interested' // Candidate declined
  | 'needs_info' // Candidate asking questions
  | 'scheduling' // Discussing scheduling
  | 'negotiating' // Discussing terms/salary
  | 'complaint' // Candidate has concerns
  | 'follow_up' // General follow-up needed
  | 'unknown';

export interface IntentClassification {
  intent: ConversationIntent;
  confidence: number;
  reasoning?: string;
  classifiedAt: Date;
}

// =============================================================================
// MAIN CONVERSATION TYPE
// =============================================================================

export interface Conversation {
  id: string;
  tenantId: string;
  candidateId: string;

  // Conversation metadata
  channel: Channel;
  externalThreadId?: string; // Thread ID in email/LinkedIn
  subject?: string;

  // State
  status: ConversationStatus;
  lastMessageAt?: Date;

  // Intent classification
  currentIntent?: ConversationIntent;
  intentConfidence?: number;
  intentHistory?: IntentClassification[];

  // Messages
  messages: Message[];
  messageCount: number;

  // Response tracking
  lastOutboundAt?: Date;
  lastInboundAt?: Date;
  avgResponseTimeMinutes?: number;

  createdAt: Date;
  updatedAt: Date;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function getLatestMessage(conversation: Conversation): Message | undefined {
  return conversation.messages[conversation.messages.length - 1];
}

export function isAwaitingResponse(conversation: Conversation): boolean {
  const latest = getLatestMessage(conversation);
  return latest?.direction === 'OUTBOUND' && !latest.readAt;
}

export function getResponseRate(conversation: Conversation): number {
  const outbound = conversation.messages.filter((m) => m.direction === 'OUTBOUND').length;
  const inbound = conversation.messages.filter((m) => m.direction === 'INBOUND').length;
  return outbound > 0 ? inbound / outbound : 0;
}

export function requiresEscalation(conversation: Conversation): boolean {
  return (
    conversation.currentIntent === 'complaint' ||
    conversation.currentIntent === 'negotiating' ||
    (conversation.intentConfidence !== undefined && conversation.intentConfidence < 0.6)
  );
}
