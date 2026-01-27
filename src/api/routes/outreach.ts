/**
 * Outreach Tracking Routes
 *
 * API endpoints for managing outreach tracking records.
 * Tracks the lifecycle of candidate outreach from connection request through pitch and follow-ups.
 */

import { Router, Request, Response } from 'express';
import {
  OutreachTrackerRepository,
  outreachTrackerRepo,
} from '../../domain/repositories/OutreachTrackerRepository.js';
import { PitchSequenceService, getPitchSequenceService } from '../../domain/services/PitchSequenceService.js';
import { getFollowUpSchedulerStats } from '../../infrastructure/queue/workers.js';
import type { OutreachType, OutreachStatus } from '../../generated/prisma/index.js';

const router = Router();

// Helper to get string from query param (handles string | string[] | undefined)
function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

// =============================================================================
// TRACKING ENDPOINTS
// =============================================================================

/**
 * POST /api/outreach/track - Create a new outreach tracker
 * Called when a connection request is sent from the queue
 */
router.post('/track', async (req: Request, res: Response) => {
  try {
    const {
      candidateProviderId,
      candidateName,
      candidateProfileUrl,
      outreachType,
      messageContent,
      jobRequisitionId,
      jobTitle,
      assessmentTemplateId,
      sourceQueueItemId,
      tenantId,
    } = req.body;

    if (!candidateProviderId) {
      return res.status(400).json({ error: 'candidateProviderId is required' });
    }

    if (!outreachType) {
      return res.status(400).json({ error: 'outreachType is required' });
    }

    const tracker = await outreachTrackerRepo.createFromQueueItem({
      candidateProviderId,
      candidateName,
      candidateProfileUrl,
      outreachType: outreachType as OutreachType,
      messageContent,
      jobRequisitionId,
      jobTitle,
      assessmentTemplateId,
      sourceQueueItemId,
      tenantId,
    });

    console.log('[Outreach API] Created tracker:', tracker.id, 'for', candidateName);

    return res.status(201).json({
      success: true,
      tracker: {
        id: tracker.id,
        candidateProviderId: tracker.candidateProviderId,
        candidateName: tracker.candidateName,
        status: tracker.status,
        outreachType: tracker.outreachType,
        sentAt: tracker.sentAt,
      },
    });
  } catch (error) {
    console.error('[Outreach API] Error creating tracker:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create tracker',
    });
  }
});

/**
 * GET /api/outreach/tracker/:id - Get a single tracker
 */
router.get('/tracker/:id', async (req: Request, res: Response) => {
  try {
    const trackerId = req.params.id as string;
    const tracker = await outreachTrackerRepo.getById(trackerId);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    return res.json({ success: true, tracker });
  } catch (error) {
    console.error('[Outreach API] Error fetching tracker:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch tracker',
    });
  }
});

/**
 * POST /api/outreach/:id/mark-connected - Manually mark a tracker as connection accepted
 * Used when webhook was missed or connection was made before tracking was implemented
 */
router.post('/:id/mark-connected', async (req: Request, res: Response) => {
  try {
    const trackerId = req.params.id as string;
    const tracker = await outreachTrackerRepo.getById(trackerId);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    // Only allow marking as connected if currently in SENT status
    if (tracker.status !== 'SENT') {
      return res.status(400).json({
        error: `Cannot mark as connected - tracker status is ${tracker.status}, expected SENT`,
      });
    }

    const updatedTracker = await outreachTrackerRepo.markConnectionAccepted(trackerId);
    console.log('[Outreach API] Manually marked tracker as connected:', trackerId, 'for', tracker.candidateName);

    return res.json({
      success: true,
      tracker: {
        id: updatedTracker.id,
        candidateProviderId: updatedTracker.candidateProviderId,
        candidateName: updatedTracker.candidateName,
        status: updatedTracker.status,
        acceptedAt: updatedTracker.acceptedAt,
      },
    });
  } catch (error) {
    console.error('[Outreach API] Error marking tracker as connected:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to mark tracker as connected',
    });
  }
});

/**
 * GET /api/outreach/pending-pitches - Get trackers ready for pitch
 * Returns candidates who accepted connection but haven't received pitch yet
 */
router.get('/pending-pitches', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId);
    const trackers = await outreachTrackerRepo.getPendingPitches(tenantId);

    return res.json({
      success: true,
      trackers,
      count: trackers.length,
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching pending pitches:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch pending pitches',
    });
  }
});

/**
 * GET /api/outreach/by-status/:status - List trackers by status
 */
router.get('/by-status/:status', async (req: Request, res: Response) => {
  try {
    const status = (req.params.status as string).toUpperCase() as OutreachStatus;
    const limit = parseInt(getQueryString(req.query.limit) || '50');
    const tenantId = getQueryString(req.query.tenantId);

    const trackers = await outreachTrackerRepo.listByStatus(status, { limit, tenantId });

    return res.json({
      success: true,
      trackers,
      count: trackers.length,
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching trackers by status:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch trackers',
    });
  }
});

/**
 * GET /api/outreach/all - List all trackers
 */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(getQueryString(req.query.limit) || '100');
    const tenantId = getQueryString(req.query.tenantId);

    const trackers = await outreachTrackerRepo.listAll({ limit, tenantId });

    return res.json({
      success: true,
      trackers,
      count: trackers.length,
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching all trackers:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch trackers',
    });
  }
});

/**
 * POST /api/outreach/:id/send-pitch - Manually trigger pitch send
 * Optionally accepts a customMessage in the request body to override AI generation
 * Set forceUpdateStatus: true to auto-update tracker status from SENT to CONNECTION_ACCEPTED
 */
router.post('/:id/send-pitch', async (req: Request, res: Response) => {
  try {
    const trackerId = req.params.id as string;
    const { customMessage, forceUpdateStatus, unipileConfig } = req.body;
    let tracker = await outreachTrackerRepo.getById(trackerId);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    // If tracker is in SENT status and forceUpdateStatus is true, auto-update it
    // This handles cases where the connection was accepted but sync didn't update the tracker
    if (tracker.status === 'SENT' && forceUpdateStatus) {
      console.log('[Outreach API] Auto-updating tracker status from SENT to CONNECTION_ACCEPTED:', trackerId);
      tracker = await outreachTrackerRepo.markConnectionAccepted(trackerId);
    }

    if (tracker.status !== 'CONNECTION_ACCEPTED' && tracker.status !== 'PITCH_PENDING') {
      return res.status(400).json({
        error: `Cannot send pitch - tracker status is ${tracker.status}, expected CONNECTION_ACCEPTED or PITCH_PENDING`,
      });
    }

    // Create a UnipileClient from the provided config since the singleton may not be initialized
    const { PitchSequenceService: PitchSvc } = await import('../../domain/services/PitchSequenceService.js');
    let unipileClient = undefined;
    if (unipileConfig?.apiKey && unipileConfig?.dsn && unipileConfig?.accountId) {
      const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
      unipileClient = new UnipileClient(unipileConfig);
    }

    // If a custom message is provided, skip AI initialization (not needed)
    // Otherwise, pass the Anthropic API key from header for AI pitch generation
    const headerApiKey = req.headers['x-anthropic-api-key'] as string | undefined;
    const anthropicApiKey = headerApiKey || process.env.ANTHROPIC_API_KEY || undefined;

    const pitchService = customMessage
      ? new PitchSvc({ skipAIInit: true, unipileClient: unipileClient || undefined })
      : new PitchSvc({ anthropicApiKey, unipileClient: unipileClient || undefined });
    const result = await pitchService.sendPitch(tracker, customMessage);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      conversationId: result.conversationId,
      messageId: result.messageId,
    });
  } catch (error) {
    console.error('[Outreach API] Error sending pitch:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to send pitch',
    });
  }
});

/**
 * POST /api/outreach/:id/generate-pitch-preview - Generate a pitch preview without sending
 * Returns the AI-generated pitch message for editing before sending
 * Requires X-Anthropic-Api-Key header for AI generation
 */
router.post('/:id/generate-pitch-preview', async (req: Request, res: Response) => {
  try {
    const trackerId = req.params.id as string;
    const headerApiKey = req.headers['x-anthropic-api-key'] as string | undefined;
    const envApiKey = process.env.ANTHROPIC_API_KEY;
    const anthropicApiKey = headerApiKey || envApiKey;

    if (!anthropicApiKey) {
      return res.status(400).json({
        error: 'Anthropic API key is required. Configure it in Settings or set ANTHROPIC_API_KEY environment variable.',
      });
    }

    const tracker = await outreachTrackerRepo.getById(trackerId);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    // Create a PitchSequenceService with the provided API key
    const { PitchSequenceService } = await import('../../domain/services/PitchSequenceService.js');
    const pitchService = new PitchSequenceService({ anthropicApiKey });
    const result = await pitchService.generatePitchPreview(tracker);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error,
      });
    }

    return res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('[Outreach API] Error generating pitch preview:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate pitch preview',
    });
  }
});

/**
 * GET /api/outreach/stats - Get outreach statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId);
    const stats = await outreachTrackerRepo.getStats(tenantId);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching stats:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
    });
  }
});

/**
 * GET /api/outreach/funnel - Get funnel statistics
 */
router.get('/funnel', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId);
    const funnel = await outreachTrackerRepo.getFunnelStats(tenantId);

    return res.json({
      success: true,
      funnel,
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching funnel:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch funnel stats',
    });
  }
});

/**
 * POST /api/outreach/process-follow-ups - Process due follow-ups (cron endpoint)
 */
router.post('/process-follow-ups', async (_req: Request, res: Response) => {
  try {
    const pitchService = getPitchSequenceService();
    const result = await pitchService.processFollowUps();

    return res.json({
      success: true,
      processed: result.processed,
      errors: result.errors,
    });
  } catch (error) {
    console.error('[Outreach API] Error processing follow-ups:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to process follow-ups',
    });
  }
});

/**
 * POST /api/outreach/status-by-providers - Get tracker status for multiple provider IDs
 * Used by the queue page to sync connection acceptance status
 */
router.post('/status-by-providers', async (req: Request, res: Response) => {
  try {
    const { providerIds } = req.body;

    if (!Array.isArray(providerIds) || providerIds.length === 0) {
      return res.status(400).json({ error: 'providerIds array is required' });
    }

    // Limit to prevent abuse
    if (providerIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 provider IDs per request' });
    }

    const trackers = await outreachTrackerRepo.findByProviderIds(providerIds);

    // Return a map of providerId -> status info (includes chatId for deep-linking)
    const statusMap: Record<string, {
      trackerId: string;
      status: string;
      acceptedAt: string | null;
      pitchSentAt: string | null;
      chatId: string | null;
    }> = {};

    for (const tracker of trackers) {
      statusMap[tracker.candidateProviderId] = {
        trackerId: tracker.id,
        status: tracker.status,
        acceptedAt: tracker.acceptedAt?.toISOString() || null,
        pitchSentAt: tracker.pitchSentAt?.toISOString() || null,
        chatId: tracker.rileyConversation?.chatId || null,
      };
    }

    return res.json({
      success: true,
      statusMap,
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching tracker status by providers:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch tracker status',
    });
  }
});

/**
 * GET /api/outreach/scheduler-status - Get follow-up scheduler status
 */
router.get('/scheduler-status', async (_req: Request, res: Response) => {
  try {
    const stats = await getFollowUpSchedulerStats();

    return res.json({
      success: true,
      scheduler: {
        isRunning: stats.isRunning,
        nextRun: stats.nextRun,
        repeatableJobsCount: stats.repeatableJobs,
        redisAvailable: stats.redisAvailable,
      },
    });
  } catch (error) {
    console.error('[Outreach API] Error fetching scheduler status:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch scheduler status',
    });
  }
});

/**
 * POST /api/outreach/sync-connections-from-linkedin - Sync connection status directly from LinkedIn
 * Queries Unipile to check actual connection status for pending outreach trackers.
 * This is useful when webhooks aren't working (e.g., local development).
 */
router.post('/sync-connections-from-linkedin', async (req: Request, res: Response) => {
  try {
    const { providerIds, unipileConfig } = req.body;

    if (!unipileConfig?.apiKey || !unipileConfig?.dsn || !unipileConfig?.accountId) {
      return res.status(400).json({ error: 'Unipile config is required' });
    }

    if (!Array.isArray(providerIds) || providerIds.length === 0) {
      return res.status(400).json({ error: 'providerIds array is required' });
    }

    // Limit to prevent abuse
    if (providerIds.length > 50) {
      return res.status(400).json({ error: 'Maximum 50 provider IDs per request' });
    }

    console.log('[Outreach API] LinkedIn sync - received', providerIds.length, 'provider IDs');
    console.log('[Outreach API] LinkedIn sync - DSN:', unipileConfig.dsn, 'Port:', unipileConfig.port || '13443 (default)');

    // Import UnipileClient dynamically to avoid initialization issues
    const { UnipileClient } = await import('../../integrations/linkedin/UnipileClient.js');
    const client = new UnipileClient(unipileConfig);

    const results: {
      providerId: string;
      isConnected: boolean;
      wasUpdated: boolean;
      candidateName?: string;
      error?: string;
    }[] = [];

    let updatedCount = 0;

    // Process each provider ID
    for (const providerId of providerIds) {
      try {
        // Small delay between requests to avoid rate limiting
        if (results.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Get profile from Unipile to check connection degree
        const profile = await client.getProfile(providerId);

        if (!profile) {
          results.push({
            providerId,
            isConnected: false,
            wasUpdated: false,
            error: 'Profile not found',
          });
          continue;
        }

        const isConnected = profile.connectionDegree === 1;

        // Find and update the tracker if they're now connected
        if (isConnected) {
          const tracker = await outreachTrackerRepo.findPendingByProviderId(providerId);

          if (tracker && tracker.status === 'SENT') {
            await outreachTrackerRepo.markConnectionAccepted(tracker.id);
            updatedCount++;
            console.log('[Outreach API] LinkedIn sync - marked as connected:', tracker.candidateName || providerId);

            results.push({
              providerId,
              isConnected: true,
              wasUpdated: true,
              candidateName: tracker.candidateName || undefined,
            });
          } else {
            results.push({
              providerId,
              isConnected: true,
              wasUpdated: false,
              candidateName: profile.name || undefined,
            });
          }
        } else {
          results.push({
            providerId,
            isConnected: false,
            wasUpdated: false,
            candidateName: profile.name || undefined,
          });
        }
      } catch (profileError) {
        console.error('[Outreach API] Error checking profile:', providerId, profileError);
        results.push({
          providerId,
          isConnected: false,
          wasUpdated: false,
          error: profileError instanceof Error ? profileError.message : 'Unknown error',
        });
      }
    }

    return res.json({
      success: true,
      results,
      summary: {
        total: providerIds.length,
        connected: results.filter(r => r.isConnected).length,
        updated: updatedCount,
        errors: results.filter(r => r.error).length,
      },
    });
  } catch (error) {
    console.error('[Outreach API] Error syncing connections from LinkedIn:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to sync connections',
    });
  }
});

export default router;
