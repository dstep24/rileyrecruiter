/**
 * Webhook Routes - Handle incoming events from external services
 *
 * Currently supports:
 * - Unipile webhooks for LinkedIn message events
 *
 * Key Feature: Riley only auto-responds to conversations that Riley initiated.
 * Random LinkedIn messages are ignored (not auto-responded to).
 */

import { Router, Request, Response } from 'express';
import { v4 as uuid } from 'uuid';
import { RileyConversationRepository } from '../../domain/repositories/RileyConversationRepository.js';
import { OutreachTrackerRepository } from '../../domain/repositories/OutreachTrackerRepository.js';
import { RileyAutoResponder } from '../../domain/services/RileyAutoResponder.js';
import { PitchSequenceService } from '../../domain/services/PitchSequenceService.js';
import { outreachSettingsService } from '../../domain/services/OutreachSettingsService.js';
import { getConversationOrchestrator } from '../../domain/services/ConversationOrchestrator.js';

const router = Router();

// Initialize repositories and services
const rileyConversationRepo = new RileyConversationRepository();
const outreachTrackerRepo = new OutreachTrackerRepository();
const rileyAutoResponder = new RileyAutoResponder();

// Lazy initialization for PitchSequenceService (depends on UnipileClient which may not be configured)
let _pitchSequenceService: PitchSequenceService | null = null;
function getPitchSequenceServiceLazy(): PitchSequenceService {
  if (!_pitchSequenceService) {
    _pitchSequenceService = new PitchSequenceService();
  }
  return _pitchSequenceService;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

// Webhook secret for verifying requests from Unipile
// Set this via environment variable: UNIPILE_WEBHOOK_SECRET
const UNIPILE_WEBHOOK_SECRET = process.env.UNIPILE_WEBHOOK_SECRET || '';

// =============================================================================
// TYPES
// =============================================================================

interface UnipileWebhookPayload {
  // Account info
  account_id: string;
  account_type: 'LINKEDIN' | 'INSTAGRAM' | 'WHATSAPP' | 'TELEGRAM';

  // Event type
  event:
    | 'message_received'
    | 'message_sent'
    | 'message_reaction'
    | 'message_read'
    | 'message_edited'
    | 'message_deleted'
    | 'message_delivered'
    | 'new_relation'
    | 'relation_removed';

  // Chat info (not present for new_relation events)
  chat_id?: string;

  // Message details
  message?: string;
  message_id?: string;
  timestamp?: string;

  // Sender info
  sender?: {
    attendee_id?: string;
    attendee_provider_id?: string;
    name?: string;
    profile_url?: string;
  };

  // Conversation participants
  attendees?: Array<{
    id: string;
    provider_id?: string;
    name?: string;
  }>;

  // Attachments
  attachments?: Array<{
    type: string;
    url?: string;
    name?: string;
  }>;

  // new_relation event fields
  user_provider_id?: string;      // New connection's LinkedIn URN (e.g., ACoXXX)
  user_full_name?: string;        // Full name of the new connection
  user_public_identifier?: string; // LinkedIn username/vanity URL
  user_profile_url?: string;      // Full profile URL
  user_picture_url?: string;      // Profile picture URL
}

interface ConversationEvent {
  id: string;
  type: 'message_received' | 'message_sent' | 'escalation_required';
  chatId: string;
  accountId: string;
  platform: 'linkedin' | 'email' | 'other';
  senderId?: string;
  senderName?: string;
  senderProfileUrl?: string;
  messageText?: string;
  messageId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// In-memory store for conversation events (replace with database in production)
const conversationEvents: ConversationEvent[] = [];
const pendingResponses: Map<string, ConversationEvent> = new Map();

// =============================================================================
// WEBHOOK ENDPOINTS
// =============================================================================

/**
 * POST /webhooks/unipile - Receive webhook events from Unipile
 *
 * Handles:
 * - message_received: New incoming message from candidate
 * - message_sent: Confirmation of sent message
 * - message_read: Read receipts
 *
 * For message_received events, this can trigger Riley's auto-response flow.
 */
router.post('/unipile', async (req: Request, res: Response) => {
  try {
    // Verify webhook authentication if secret is configured
    if (UNIPILE_WEBHOOK_SECRET) {
      const authHeader = req.headers['unipile-auth'] as string | undefined;
      if (!authHeader || authHeader !== UNIPILE_WEBHOOK_SECRET) {
        console.warn('[Webhook] Unauthorized request - invalid or missing Unipile-Auth header');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const payload = req.body as UnipileWebhookPayload;

    console.log('[Webhook] Received Unipile event:', payload.event, {
      accountId: payload.account_id,
      chatId: payload.chat_id,
      accountType: payload.account_type,
    });

    // Validate required fields
    if (!payload.event || !payload.account_id) {
      return res.status(400).json({
        error: 'Missing required fields: event, account_id',
      });
    }

    // Handle new_relation event separately (no chat_id)
    if (payload.event === 'new_relation') {
      await handleNewRelation(payload);
      return res.status(200).json({
        success: true,
        eventType: 'new_relation',
        processed: true,
      });
    }

    // For message events, require chat_id
    if (!payload.chat_id) {
      console.log('[Webhook] No chat_id for event:', payload.event);
      return res.status(200).json({
        success: true,
        eventType: payload.event,
        processed: false,
        reason: 'No chat_id provided',
      });
    }

    // Create conversation event record
    const event: ConversationEvent = {
      id: uuid(),
      type: payload.event === 'message_received' ? 'message_received' : 'message_sent',
      chatId: payload.chat_id,
      accountId: payload.account_id,
      platform: payload.account_type === 'LINKEDIN' ? 'linkedin' : 'other',
      senderId: payload.sender?.attendee_provider_id,
      senderName: payload.sender?.name,
      senderProfileUrl: payload.sender?.profile_url,
      messageText: payload.message,
      messageId: payload.message_id,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      metadata: {
        attendees: payload.attendees,
        attachments: payload.attachments,
      },
    };

    // Store the event
    conversationEvents.push(event);

    // Handle specific event types
    switch (payload.event) {
      case 'message_received':
        await handleIncomingMessage(event, payload);
        break;

      case 'message_sent':
        console.log('[Webhook] Message sent confirmation:', payload.message_id);
        break;

      case 'message_read':
        console.log('[Webhook] Message read:', payload.chat_id);
        break;

      case 'relation_removed':
        console.log('[Webhook] Relation removed:', payload.user_provider_id);
        break;

      default:
        console.log('[Webhook] Unhandled event type:', payload.event);
    }

    // Acknowledge receipt
    return res.status(200).json({
      success: true,
      eventId: event.id,
      processed: true,
    });
  } catch (error) {
    console.error('[Webhook] Error processing Unipile webhook:', error);
    return res.status(500).json({
      error: 'Internal server error processing webhook',
    });
  }
});

/**
 * Handle new_relation event - LinkedIn connection request was accepted
 *
 * This is triggered when someone accepts our connection request.
 * We match it to a pending outreach tracker and optionally send the pitch.
 */
async function handleNewRelation(payload: UnipileWebhookPayload): Promise<void> {
  const providerId = payload.user_provider_id;

  console.log('[Webhook] new_relation event received:', {
    providerId,
    name: payload.user_full_name,
    profileUrl: payload.user_profile_url,
  });

  if (!providerId) {
    console.warn('[Webhook] new_relation event missing user_provider_id');
    return;
  }

  try {
    // Find matching outreach tracker (pending connection request for this candidate)
    const tracker = await outreachTrackerRepo.findPendingByProviderId(providerId);

    if (!tracker) {
      console.log('[Webhook] new_relation for unknown candidate (not in outreach tracker):', providerId);
      // This could be a connection that wasn't initiated through Riley
      return;
    }

    console.log('[Webhook] Connection accepted! Candidate:', tracker.candidateName || providerId);

    // Check if autopilot mode is enabled
    const autopilotEnabled = outreachSettingsService.isAutopilotEnabled(tracker.tenantId);

    console.log('[Webhook] Autopilot mode:', autopilotEnabled ? 'ENABLED' : 'DISABLED');

    // Handle the connection acceptance via PitchSequenceService
    // This will:
    // 1. Update tracker status to CONNECTION_ACCEPTED
    // 2. Create notification
    // 3. Auto-send pitch ONLY if autopilot is enabled
    await getPitchSequenceServiceLazy().handleConnectionAccepted(tracker, {
      autoPitch: autopilotEnabled,
    });

    console.log('[Webhook] Connection acceptance processed for:', tracker.candidateName);
  } catch (error) {
    console.error('[Webhook] Error handling new_relation:', error);
  }
}

/**
 * Handle incoming message - decide whether to auto-reply or escalate
 *
 * KEY FEATURE: Only auto-respond to Riley-initiated conversations.
 * Messages from random LinkedIn users are ignored.
 */
async function handleIncomingMessage(
  event: ConversationEvent,
  payload: UnipileWebhookPayload
): Promise<void> {
  console.log('[Webhook] Processing incoming message:', {
    from: event.senderName,
    text: event.messageText?.substring(0, 100),
    chatId: event.chatId,
  });

  // =========================================================================
  // STEP 1: Check if this is a Riley-initiated conversation
  // =========================================================================
  const isRileyConversation = await rileyConversationRepo.isRileyInitiated(event.chatId);

  if (!isRileyConversation) {
    console.log('[Webhook] Ignoring message - not a Riley-initiated conversation:', event.chatId);
    // Store in general events for logging, but don't auto-respond
    return;
  }

  console.log('[Webhook] This IS a Riley-initiated conversation - processing for auto-response');

  // =========================================================================
  // STEP 2: Store the incoming message in the database
  // =========================================================================
  try {
    await rileyConversationRepo.addCandidateMessage(
      event.chatId,
      event.messageText || '',
      event.messageId
    );
    console.log('[Webhook] Stored candidate message in database');
  } catch (dbError) {
    console.error('[Webhook] Failed to store message in database:', dbError);
    // Continue anyway - we can still try to respond
  }

  // =========================================================================
  // STEP 3: Check for escalation triggers
  // =========================================================================
  const escalationCheck = rileyAutoResponder.checkForEscalation(event.messageText || '');

  if (escalationCheck.shouldEscalate) {
    console.log('[Webhook] Message requires escalation:', escalationCheck.reason);

    // Mark as escalated in database
    try {
      await rileyConversationRepo.escalate(event.chatId, escalationCheck.reason || 'Unknown');
    } catch (escalateError) {
      console.error('[Webhook] Failed to mark as escalated:', escalateError);
    }

    // Mark in memory for backward compatibility
    event.type = 'escalation_required';
    pendingResponses.set(event.chatId, event);

    console.log('[Webhook] Added to escalation queue - human review needed');
    return;
  }

  // =========================================================================
  // STEP 4: Generate and send auto-response using ConversationOrchestrator
  // This now includes Calendly link rotation and booking intent detection
  // =========================================================================
  console.log('[Webhook] Processing with ConversationOrchestrator...');

  try {
    // Get the full conversation context from database
    const conversation = await rileyConversationRepo.getByChatId(event.chatId);

    if (!conversation) {
      console.error('[Webhook] Conversation not found in database:', event.chatId);
      return;
    }

    // Use ConversationOrchestrator for intelligent response generation
    // This handles:
    // - AI response generation
    // - Booking intent detection
    // - Calendly link rotation (round-robin)
    // - Escalation keyword detection
    const orchestrator = getConversationOrchestrator();
    const result = await orchestrator.handleIncomingMessage({
      conversation,
      message: event.messageText || '',
      messageId: event.messageId,
    });

    // Handle escalation
    if (result.shouldEscalate) {
      console.log('[Webhook] Orchestrator triggered escalation:', result.escalationReason);
      await rileyConversationRepo.escalate(event.chatId, result.escalationReason || 'Orchestrator escalation');
      event.type = 'escalation_required';
      pendingResponses.set(event.chatId, event);
      return;
    }

    // Check if we should send a response
    if (!result.shouldSend || !result.response) {
      console.log('[Webhook] No response to send');
      return;
    }

    console.log('[Webhook] Generated response:', result.response.substring(0, 100));
    if (result.calendlyLink) {
      console.log('[Webhook] Included Calendly link from:', result.recruiterName);
    }

    // Send the reply via Unipile
    const unipileConfig = {
      apiKey: process.env.UNIPILE_API_KEY,
      dsn: process.env.UNIPILE_DSN,
      accountId: payload.account_id,
    };

    if (!unipileConfig.apiKey || !unipileConfig.dsn) {
      console.log('[Webhook] Unipile config not available - storing response for manual send');
      pendingResponses.set(event.chatId, {
        ...event,
        metadata: {
          ...event.metadata,
          generatedResponse: result.response,
          calendlyLink: result.calendlyLink,
          recruiterName: result.recruiterName,
          generatedAt: new Date().toISOString(),
        },
      });
      return;
    }

    // Send the reply
    const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
    const client = new UnipileClient(unipileConfig as { apiKey: string; dsn: string; accountId: string });

    const sentMessage = await client.replyToChat(event.chatId, result.response);
    console.log('[Webhook] Sent auto-response, message ID:', sentMessage.id);

    // Store Riley's response in database
    await rileyConversationRepo.addRileyResponse(
      event.chatId,
      result.response,
      sentMessage.id
    );

    // Update stage if changed (e.g., to SCHEDULING when Calendly link sent)
    if (result.newStage) {
      await rileyConversationRepo.updateStage(event.chatId, result.newStage);
      console.log('[Webhook] Updated conversation stage to:', result.newStage);
    }

    // Log the sent message event
    const responseEvent: ConversationEvent = {
      id: uuid(),
      type: 'message_sent',
      chatId: event.chatId,
      accountId: payload.account_id,
      platform: 'linkedin',
      messageText: result.response,
      messageId: sentMessage.id,
      timestamp: new Date(),
      metadata: {
        autoGenerated: true,
        calendlyLink: result.calendlyLink,
        recruiterName: result.recruiterName,
      },
    };
    conversationEvents.push(responseEvent);

    console.log('[Webhook] Auto-response complete');

  } catch (error) {
    console.error('[Webhook] Error in auto-response flow:', error);
    // Store for manual review
    event.type = 'escalation_required';
    pendingResponses.set(event.chatId, {
      ...event,
      metadata: {
        ...event.metadata,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });
  }
}

// =============================================================================
// API ENDPOINTS FOR CONVERSATION MANAGEMENT
// =============================================================================

/**
 * GET /webhooks/conversations - List recent conversation events
 */
router.get('/conversations', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const events = conversationEvents.slice(-limit).reverse();

  return res.json({
    success: true,
    events,
    total: conversationEvents.length,
  });
});

/**
 * POST /webhooks/linkedin/chats - Fetch actual LinkedIn conversations via Unipile
 * This pulls real conversation data from LinkedIn, filtered to only Riley-initiated chats
 */
router.post('/linkedin/chats', async (req: Request, res: Response) => {
  const { unipileConfig, limit = 20 } = req.body;

  if (!unipileConfig?.apiKey || !unipileConfig?.dsn || !unipileConfig?.accountId) {
    return res.status(400).json({ error: 'Unipile config is required' });
  }

  try {
    const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
    const client = new UnipileClient(unipileConfig);

    // Build a map of recipient info from our stored events (if any - these are lost on server restart)
    const chatRecipientInfo = new Map<string, { name: string; profileUrl?: string }>();
    for (const event of conversationEvents) {
      if (event.chatId && event.senderName) {
        chatRecipientInfo.set(event.chatId, {
          name: event.senderName,
          profileUrl: event.senderProfileUrl,
        });
      }
    }

    // Fetch recent chats from LinkedIn
    // Note: We show all chats since conversationEvents is in-memory and lost on restart
    // In production, this should be filtered by a database of Riley-initiated chats
    const { items: chats } = await client.listChats(limit);

    console.log('[Webhook] Fetched', chats.length, 'chats from LinkedIn');
    console.log('[Webhook] Account ID for sender detection:', unipileConfig.accountId);

    // Log first chat structure for debugging
    if (chats.length > 0) {
      console.log('[Webhook] Sample chat structure:', JSON.stringify(chats[0], null, 2));
    }

    // Transform to our format
    const conversations = await Promise.all(
      chats.map(async (chat) => {
        // Get messages for this chat
        const { items: messages } = await client.getChatMessages(chat.id, 10);

        // Get the attendee provider ID from the chat
        const chatWithAttendee = chat as {
          id: string;
          attendee_provider_id?: string;
          attendees?: Array<{ name?: string; first_name?: string; last_name?: string; profile_url?: string; profile_picture_url?: string }>;
          participants?: Array<{ name?: string; first_name?: string; last_name?: string; profile_url?: string; profile_picture_url?: string }>;
          unread_count?: number;
          updated_at?: string;
        };

        // Try to get participant info from multiple sources
        let participantName: string | undefined;
        let participantProfileUrl: string | undefined;
        let participantPictureUrl: string | undefined;

        // 1. Check our stored info
        const storedInfo = chatRecipientInfo.get(chat.id);
        if (storedInfo?.name) {
          participantName = storedInfo.name;
          participantProfileUrl = storedInfo.profileUrl;
        }

        // 2. Check chat attendees/participants arrays
        const participant = chatWithAttendee.attendees?.[0] || chatWithAttendee.participants?.[0];
        if (!participantName && participant) {
          participantName = participant.name ||
            [participant.first_name, participant.last_name].filter(Boolean).join(' ') ||
            undefined;
          participantProfileUrl = participantProfileUrl || participant.profile_url;
          participantPictureUrl = participant.profile_picture_url;
        }

        // 3. If we still don't have a name but have attendee_provider_id, try to look up the profile
        if (!participantName && chatWithAttendee.attendee_provider_id) {
          try {
            const profile = await client.getProfile(chatWithAttendee.attendee_provider_id);
            if (profile) {
              participantName = profile.name ||
                [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
                undefined;
              participantProfileUrl = participantProfileUrl || profile.profile_url;
              participantPictureUrl = participantPictureUrl || profile.profile_picture_url;
            }
          } catch (profileError) {
            console.log('[Webhook] Could not fetch profile for attendee:', chatWithAttendee.attendee_provider_id);
          }
        }

        // 4. Fallback
        if (!participantName) {
          participantName = 'LinkedIn User';
        }

        // Parse timestamps properly
        const parseTimestamp = (ts: string | number | Date | undefined): string => {
          if (!ts) return new Date().toISOString();
          try {
            const date = new Date(ts);
            if (isNaN(date.getTime())) return new Date().toISOString();
            return date.toISOString();
          } catch {
            return new Date().toISOString();
          }
        };

        return {
          id: chat.id,
          chatId: chat.id,
          candidateName: participantName,
          candidateProfileUrl: participantProfileUrl,
          candidatePictureUrl: participantPictureUrl,
          lastMessageAt: parseTimestamp(chat.updated_at),
          unreadCount: chat.unread_count || 0,
          messages: messages.map((msg) => {
            const msgWithSender = msg as {
              id: string;
              text?: string;
              sender_id?: string;
              created_at?: string | number | Date;
              timestamp?: string | number | Date;
              is_sender?: number; // Unipile uses 0 or 1 (number, not boolean)
            };

            // Determine if this message was sent by Riley (the authenticated account)
            // Unipile uses is_sender: 1 when the authenticated account sent the message, 0 otherwise
            const isFromRiley = msgWithSender.is_sender === 1;

            return {
              id: msgWithSender.id,
              role: isFromRiley ? 'riley' : 'candidate',
              content: msgWithSender.text || '',
              timestamp: parseTimestamp(msgWithSender.created_at || msgWithSender.timestamp),
            };
          }),
        };
      })
    );

    return res.json({
      success: true,
      conversations,
      total: conversations.length,
    });
  } catch (error) {
    console.error('[Webhook] Error fetching LinkedIn chats:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch chats',
    });
  }
});

/**
 * POST /webhooks/linkedin/chat/:chatId/messages - Fetch messages for a specific chat
 */
router.post('/linkedin/chat/:chatId/messages', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;
  const { unipileConfig, limit = 50 } = req.body;

  if (!unipileConfig?.apiKey || !unipileConfig?.dsn || !unipileConfig?.accountId) {
    return res.status(400).json({ error: 'Unipile config is required' });
  }

  try {
    const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
    const client = new UnipileClient(unipileConfig);

    const { items: messages } = await client.getChatMessages(chatId, limit);

    return res.json({
      success: true,
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.sender_id === unipileConfig.accountId ? 'riley' : 'candidate',
        content: msg.text,
        timestamp: msg.created_at,
        senderId: msg.sender_id,
      })),
    });
  } catch (error) {
    console.error('[Webhook] Error fetching chat messages:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch messages',
    });
  }
});

/**
 * GET /webhooks/pending - Get messages pending response or escalation
 */
router.get('/pending', async (_req: Request, res: Response) => {
  const pending = Array.from(pendingResponses.values());

  return res.json({
    success: true,
    pending,
    count: pending.length,
  });
});

/**
 * POST /webhooks/conversations/:chatId/respond - Send a manual response
 * Used by teleoperators to respond to escalated messages
 */
router.post('/conversations/:chatId/respond', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;
  const { message, unipileConfig } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!unipileConfig?.apiKey || !unipileConfig?.dsn || !unipileConfig?.accountId) {
    return res.status(400).json({ error: 'Unipile config is required' });
  }

  try {
    // Import and use UnipileClient
    const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
    const client = new UnipileClient(unipileConfig);

    // Send the reply
    const result = await client.replyToChat(chatId, message);

    // Remove from pending
    pendingResponses.delete(chatId);

    // Log the response
    const responseEvent: ConversationEvent = {
      id: uuid(),
      type: 'message_sent',
      chatId,
      accountId: unipileConfig.accountId as string,
      platform: 'linkedin',
      messageText: message,
      messageId: result.id,
      timestamp: new Date(),
      metadata: { manual: true, respondedBy: 'teleoperator' },
    };
    conversationEvents.push(responseEvent);

    return res.json({
      success: true,
      message: result,
      eventId: responseEvent.id,
    });
  } catch (error) {
    console.error('[Webhook] Error sending manual response:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send response',
    });
  }
});

/**
 * POST /webhooks/conversations/:chatId/dismiss - Dismiss a pending message
 * Used when teleoperator decides no response is needed
 */
router.post('/conversations/:chatId/dismiss', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;
  const { reason } = req.body;

  const pending = pendingResponses.get(chatId);
  if (!pending) {
    return res.status(404).json({ error: 'No pending message found for this chat' });
  }

  // Remove from pending
  pendingResponses.delete(chatId);

  console.log('[Webhook] Dismissed pending message:', { chatId, reason });

  return res.json({
    success: true,
    dismissed: true,
    chatId,
    reason,
  });
});

/**
 * POST /webhooks/conversations/new - Start a new conversation with a LinkedIn user
 * Used to manually initiate outreach to someone not yet in the system
 */
router.post('/conversations/new', async (req: Request, res: Response) => {
  const { recipientProfileUrl, recipientProviderId, message, unipileConfig } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  if (!recipientProfileUrl && !recipientProviderId) {
    return res.status(400).json({ error: 'Either recipientProfileUrl or recipientProviderId is required' });
  }

  if (!unipileConfig?.apiKey || !unipileConfig?.dsn || !unipileConfig?.accountId) {
    return res.status(400).json({ error: 'Unipile config is required' });
  }

  try {
    // Import and use UnipileClient
    const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
    const client = new UnipileClient(unipileConfig);

    let userProviderId = recipientProviderId;

    // If we have a profile URL but no provider ID, we need to extract/lookup the provider ID
    if (recipientProfileUrl && !userProviderId) {
      // Extract provider ID from LinkedIn URL
      // URLs look like: https://www.linkedin.com/in/username/ or https://linkedin.com/in/username
      const match = recipientProfileUrl.match(/linkedin\.com\/in\/([^\/\?]+)/);
      if (match) {
        userProviderId = match[1];
      } else {
        return res.status(400).json({
          error: 'Could not extract LinkedIn username from URL. Please provide a valid LinkedIn profile URL (e.g., https://linkedin.com/in/username)'
        });
      }
    }

    console.log('[Webhook] Starting new conversation with:', {
      userProviderId,
      recipientProfileUrl,
      messageLength: message.length,
    });

    // First, try to look up the user to get their actual Unipile provider ID
    // The username from the URL won't work directly with the chat API - we need the provider_id
    let actualProviderId = userProviderId;

    try {
      // Use getProfileByPublicId which searches for the user and gets their provider_id
      const profileResponse = await client.getProfileByPublicId(userProviderId);
      if (profileResponse?.provider_id) {
        actualProviderId = profileResponse.provider_id;
        console.log('[Webhook] Resolved provider ID from public ID:', actualProviderId);
      } else if (profileResponse?.id) {
        actualProviderId = profileResponse.id;
        console.log('[Webhook] Using profile ID:', actualProviderId);
      } else {
        console.log('[Webhook] Could not resolve profile for:', userProviderId);
        return res.status(400).json({
          error: `Could not find LinkedIn user: ${userProviderId}. Make sure the profile URL is correct and the user exists.`
        });
      }
    } catch (lookupError) {
      console.error('[Webhook] Profile lookup failed:', lookupError);
      return res.status(400).json({
        error: `Could not lookup LinkedIn user: ${userProviderId}. Error: ${lookupError instanceof Error ? lookupError.message : 'Unknown error'}`
      });
    }

    // Get the profile info so we have the recipient's name
    const profileData = await client.getProfileByPublicId(userProviderId);
    const recipientName = profileData?.name ||
      `${profileData?.first_name || ''} ${profileData?.last_name || ''}`.trim() ||
      userProviderId;
    const resolvedProfileUrl = profileData?.profile_url ||
      recipientProfileUrl ||
      `https://www.linkedin.com/in/${userProviderId}/`;

    // Send the message using the messageUser method
    const result = await client.messageUser(actualProviderId, message);

    // Extract message ID safely - the API response structure may vary
    const messageId = result.message?.id || result.message?.provider_id || 'unknown';
    const chatId = result.chatId || 'unknown';

    console.log('[Webhook] messageUser result:', JSON.stringify(result, null, 2));

    // =========================================================================
    // IMPORTANT: Register this as a Riley-initiated conversation in the database
    // This is what allows us to filter and auto-respond only to Riley's conversations
    // =========================================================================
    try {
      await rileyConversationRepo.createFromOutreach({
        chatId,
        candidateProviderId: actualProviderId,
        candidateName: recipientName,
        candidateProfileUrl: resolvedProfileUrl,
        initialMessage: message,
        // Job context can be added when initiating from sourcing
        jobTitle: req.body.jobTitle,
        jobRequisitionId: req.body.jobRequisitionId,
      });
      console.log('[Webhook] Registered Riley-initiated conversation in database:', chatId);
    } catch (dbError) {
      // Log but don't fail - the message was sent successfully
      console.error('[Webhook] Failed to register conversation in database:', dbError);
    }

    // Log the new conversation with recipient info (in-memory for backward compatibility)
    const newConversationEvent: ConversationEvent = {
      id: uuid(),
      type: 'message_sent',
      chatId,
      accountId: unipileConfig.accountId as string,
      platform: 'linkedin',
      messageText: message,
      messageId,
      timestamp: new Date(),
      // Store recipient info so we can display it in the dashboard
      senderId: actualProviderId,
      senderName: recipientName,  // For outbound, use recipient name as conversation name
      senderProfileUrl: resolvedProfileUrl,
      metadata: {
        manual: true,
        initiatedBy: 'teleoperator',
        recipientProviderId: userProviderId,
        recipientName,
        isNewChat: result.isNewChat,
      },
    };
    conversationEvents.push(newConversationEvent);

    console.log('[Webhook] New Riley-initiated conversation started:', {
      chatId,
      recipientProviderId: userProviderId,
      isNewChat: result.isNewChat,
      registeredInDb: true,
    });

    return res.json({
      success: true,
      chatId,
      messageId,
      isNewChat: result.isNewChat,
      eventId: newConversationEvent.id,
      rileyInitiated: true, // Flag to indicate this conversation will receive auto-responses
    });
  } catch (error) {
    console.error('[Webhook] Error starting new conversation:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to start conversation',
    });
  }
});

// =============================================================================
// RILEY CONVERSATIONS API - Database-backed endpoints
// These are the primary endpoints for the dashboard to use
// =============================================================================

/**
 * GET /webhooks/riley-conversations - List Riley-initiated conversations from database
 * This is the preferred endpoint for the dashboard - shows only Riley-initiated conversations
 */
router.get('/riley-conversations', async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const status = req.query.status as string | undefined;
  const stage = req.query.stage as string | undefined;

  try {
    const conversations = await rileyConversationRepo.listAll({
      limit,
      status: status as 'ACTIVE' | 'PAUSED' | 'ESCALATED' | 'COMPLETED' | undefined,
      stage: stage as 'INITIAL_OUTREACH' | 'AWAITING_RESPONSE' | 'IN_CONVERSATION' | 'SCHEDULING' | 'SCHEDULED' | 'FOLLOW_UP' | 'CLOSED_INTERESTED' | 'CLOSED_NOT_INTERESTED' | 'CLOSED_NO_RESPONSE' | undefined,
    });

    // Transform to the format expected by the dashboard
    // Using explicit cast since Prisma types may not be fully available until migration runs
    const transformedConversations = (conversations as unknown as Array<Record<string, unknown>>).map((conv) => ({
      id: conv.id,
      chatId: conv.chatId,
      candidateName: (conv.candidateName as string) || 'LinkedIn User',
      candidateTitle: conv.candidateTitle,
      candidateCompany: conv.candidateCompany,
      candidateProfileUrl: conv.candidateProfileUrl,
      jobTitle: conv.jobTitle,
      stage: String(conv.stage).toLowerCase(),
      status: String(conv.status).toLowerCase(),
      escalationReason: conv.escalationReason,
      messages: ((conv.messages as Array<Record<string, unknown>>) || []).map((msg) => ({
        id: msg.id,
        role: String(msg.role).toLowerCase(),
        content: msg.content,
        timestamp: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
        metadata: {
          isAutoGenerated: msg.isAutoGenerated,
          unipileMessageId: msg.unipileMessageId,
        },
      })),
      lastMessageAt: conv.lastMessageAt instanceof Date ? conv.lastMessageAt.toISOString() : conv.lastMessageAt,
      lastMessageBy: String(conv.lastMessageBy).toLowerCase(),
      messageCount: conv.messageCount,
      schedulingRequested: conv.schedulingRequested,
      scheduledCallAt: conv.scheduledCallAt instanceof Date ? conv.scheduledCallAt.toISOString() : conv.scheduledCallAt,
      isEscalated: conv.isEscalated,
      createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : conv.createdAt,
    }));

    return res.json({
      success: true,
      conversations: transformedConversations,
      total: transformedConversations.length,
      source: 'database',
    });
  } catch (error) {
    console.error('[Webhook] Error fetching Riley conversations:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch conversations',
    });
  }
});

/**
 * GET /webhooks/riley-conversations/:chatId - Get a specific Riley conversation
 */
router.get('/riley-conversations/:chatId', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;

  try {
    const result = await rileyConversationRepo.getByChatId(chatId);

    if (!result) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Cast to work around Prisma types not being available until migration
    const conversation = result as unknown as Record<string, unknown>;
    const messages = (conversation.messages as Array<Record<string, unknown>>) || [];

    return res.json({
      success: true,
      conversation: {
        id: conversation.id,
        chatId: conversation.chatId,
        candidateName: (conversation.candidateName as string) || 'LinkedIn User',
        candidateTitle: conversation.candidateTitle,
        candidateCompany: conversation.candidateCompany,
        candidateProfileUrl: conversation.candidateProfileUrl,
        jobTitle: conversation.jobTitle,
        stage: String(conversation.stage).toLowerCase(),
        status: String(conversation.status).toLowerCase(),
        escalationReason: conversation.escalationReason,
        messages: messages.map((msg) => ({
          id: msg.id,
          role: String(msg.role).toLowerCase(),
          content: msg.content,
          timestamp: msg.createdAt instanceof Date ? msg.createdAt.toISOString() : msg.createdAt,
          metadata: {
            isAutoGenerated: msg.isAutoGenerated,
            unipileMessageId: msg.unipileMessageId,
          },
        })),
        lastMessageAt: conversation.lastMessageAt instanceof Date ? conversation.lastMessageAt.toISOString() : conversation.lastMessageAt,
        lastMessageBy: String(conversation.lastMessageBy).toLowerCase(),
        messageCount: conversation.messageCount,
        schedulingRequested: conversation.schedulingRequested,
        scheduledCallAt: conversation.scheduledCallAt instanceof Date ? conversation.scheduledCallAt.toISOString() : conversation.scheduledCallAt,
        isEscalated: conversation.isEscalated,
        createdAt: conversation.createdAt instanceof Date ? conversation.createdAt.toISOString() : conversation.createdAt,
      },
    });
  } catch (error) {
    console.error('[Webhook] Error fetching Riley conversation:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch conversation',
    });
  }
});

/**
 * GET /webhooks/riley-conversations/stats - Get conversation statistics
 */
router.get('/riley-conversations-stats', async (_req: Request, res: Response) => {
  try {
    const stats = await rileyConversationRepo.getStats();

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Webhook] Error fetching stats:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
    });
  }
});

/**
 * POST /webhooks/riley-conversations/:chatId/escalate - Escalate a conversation
 */
router.post('/riley-conversations/:chatId/escalate', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;
  const { reason } = req.body;

  if (!reason) {
    return res.status(400).json({ error: 'Reason is required' });
  }

  try {
    const result = await rileyConversationRepo.escalate(chatId, reason);
    const conversation = result as unknown as Record<string, unknown>;

    return res.json({
      success: true,
      conversation: {
        id: conversation.id,
        chatId: conversation.chatId,
        status: conversation.status,
        isEscalated: conversation.isEscalated,
        escalationReason: conversation.escalationReason,
      },
    });
  } catch (error) {
    console.error('[Webhook] Error escalating conversation:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to escalate conversation',
    });
  }
});

/**
 * POST /webhooks/riley-conversations/:chatId/resume - Resume a paused/escalated conversation
 */
router.post('/riley-conversations/:chatId/resume', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;

  try {
    const result = await rileyConversationRepo.resume(chatId);
    const conversation = result as unknown as Record<string, unknown>;

    return res.json({
      success: true,
      conversation: {
        id: conversation.id,
        chatId: conversation.chatId,
        status: conversation.status,
        isEscalated: conversation.isEscalated,
      },
    });
  } catch (error) {
    console.error('[Webhook] Error resuming conversation:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to resume conversation',
    });
  }
});

/**
 * POST /webhooks/riley-conversations/:chatId/close - Close a conversation
 */
router.post('/riley-conversations/:chatId/close', async (req: Request, res: Response) => {
  const chatId = req.params.chatId as string;
  const { outcome } = req.body;

  const validOutcomes = ['CLOSED_INTERESTED', 'CLOSED_NOT_INTERESTED', 'CLOSED_NO_RESPONSE'];
  if (!outcome || !validOutcomes.includes(outcome)) {
    return res.status(400).json({
      error: `Outcome must be one of: ${validOutcomes.join(', ')}`,
    });
  }

  try {
    const result = await rileyConversationRepo.close(chatId, outcome);
    const conversation = result as unknown as Record<string, unknown>;

    return res.json({
      success: true,
      conversation: {
        id: conversation.id,
        chatId: conversation.chatId,
        stage: conversation.stage,
        status: conversation.status,
      },
    });
  } catch (error) {
    console.error('[Webhook] Error closing conversation:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to close conversation',
    });
  }
});

export default router;
