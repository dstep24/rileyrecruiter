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
 */
router.post('/:id/send-pitch', async (req: Request, res: Response) => {
  try {
    const trackerId = req.params.id as string;
    const tracker = await outreachTrackerRepo.getById(trackerId);

    if (!tracker) {
      return res.status(404).json({ error: 'Tracker not found' });
    }

    if (tracker.status !== 'CONNECTION_ACCEPTED' && tracker.status !== 'PITCH_PENDING') {
      return res.status(400).json({
        error: `Cannot send pitch - tracker status is ${tracker.status}, expected CONNECTION_ACCEPTED or PITCH_PENDING`,
      });
    }

    const pitchService = getPitchSequenceService();
    const result = await pitchService.sendPitch(tracker);

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

export default router;
