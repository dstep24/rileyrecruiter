/**
 * Calendly Link Rotation Routes
 *
 * API endpoints for managing recruiter Calendly links and round-robin assignment.
 * Supports CRUD operations on links and viewing assignment history/stats.
 */

import { Router, Request, Response } from 'express';
import {
  CalendlyRotatorService,
  getCalendlyRotatorService,
} from '../../domain/services/CalendlyRotatorService.js';

const router = Router();

// Helper to get string from query param
function getQueryString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

// =============================================================================
// LINK MANAGEMENT ENDPOINTS
// =============================================================================

/**
 * GET /api/calendly/links - List all recruiter Calendly links
 */
router.get('/links', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';
    const service = getCalendlyRotatorService();
    const links = await service.listLinks(tenantId);

    return res.json({
      success: true,
      links,
      count: links.length,
    });
  } catch (error) {
    console.error('[Calendly API] Error listing links:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list links',
    });
  }
});

/**
 * POST /api/calendly/links - Create a new recruiter Calendly link
 */
router.post('/links', async (req: Request, res: Response) => {
  try {
    const { recruiterName, calendlyUrl, tenantId } = req.body;

    if (!recruiterName || !calendlyUrl) {
      return res.status(400).json({
        error: 'recruiterName and calendlyUrl are required',
      });
    }

    const service = getCalendlyRotatorService();
    const link = await service.createLink({
      recruiterName,
      calendlyUrl,
      tenantId: tenantId || 'development',
    });

    console.log('[Calendly API] Created link:', link.recruiterName);

    return res.status(201).json({
      success: true,
      link,
    });
  } catch (error) {
    console.error('[Calendly API] Error creating link:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to create link',
    });
  }
});

/**
 * PATCH /api/calendly/links/:id - Update a Calendly link
 */
router.patch('/links/:id', async (req: Request, res: Response) => {
  try {
    const linkId = req.params.id;
    const { recruiterName, calendlyUrl, isActive } = req.body;

    const service = getCalendlyRotatorService();
    const link = await service.updateLink(linkId, {
      recruiterName,
      calendlyUrl,
      isActive,
    });

    console.log('[Calendly API] Updated link:', linkId);

    return res.json({
      success: true,
      link,
    });
  } catch (error) {
    console.error('[Calendly API] Error updating link:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to update link',
    });
  }
});

/**
 * DELETE /api/calendly/links/:id - Delete a Calendly link
 */
router.delete('/links/:id', async (req: Request, res: Response) => {
  try {
    const linkId = req.params.id;

    const service = getCalendlyRotatorService();
    await service.deleteLink(linkId);

    console.log('[Calendly API] Deleted link:', linkId);

    return res.json({
      success: true,
    });
  } catch (error) {
    console.error('[Calendly API] Error deleting link:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to delete link',
    });
  }
});

/**
 * POST /api/calendly/links/:id/toggle - Toggle link active status
 */
router.post('/links/:id/toggle', async (req: Request, res: Response) => {
  try {
    const linkId = req.params.id;
    const { isActive } = req.body;

    const service = getCalendlyRotatorService();
    const link = await service.updateLink(linkId, { isActive });

    console.log('[Calendly API] Toggled link:', linkId, 'active:', isActive);

    return res.json({
      success: true,
      link,
    });
  } catch (error) {
    console.error('[Calendly API] Error toggling link:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to toggle link',
    });
  }
});

// =============================================================================
// ASSIGNMENT ENDPOINTS
// =============================================================================

/**
 * GET /api/calendly/assignments - Get assignment history
 */
router.get('/assignments', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';
    const limit = parseInt(getQueryString(req.query.limit) || '50');
    const offset = parseInt(getQueryString(req.query.offset) || '0');

    const service = getCalendlyRotatorService();
    const assignments = await service.listAssignments(limit, offset, tenantId);

    return res.json({
      success: true,
      assignments,
      count: assignments.length,
    });
  } catch (error) {
    console.error('[Calendly API] Error listing assignments:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to list assignments',
    });
  }
});

/**
 * POST /api/calendly/assignments/:id/confirm - Mark booking as confirmed
 */
router.post('/assignments/:id/confirm', async (req: Request, res: Response) => {
  try {
    const assignmentId = req.params.id;

    const service = getCalendlyRotatorService();
    const assignment = await service.confirmBooking(assignmentId);

    console.log('[Calendly API] Confirmed booking:', assignmentId);

    return res.json({
      success: true,
      assignment,
    });
  } catch (error) {
    console.error('[Calendly API] Error confirming booking:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to confirm booking',
    });
  }
});

// =============================================================================
// STATS ENDPOINTS
// =============================================================================

/**
 * GET /api/calendly/stats - Get rotation statistics
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';

    const service = getCalendlyRotatorService();
    const stats = await service.getStats(tenantId);

    return res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('[Calendly API] Error fetching stats:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to fetch stats',
    });
  }
});

/**
 * GET /api/calendly/next - Get next link in rotation (for testing)
 * Does not record an assignment, just shows what would be selected
 */
router.get('/next', async (req: Request, res: Response) => {
  try {
    const tenantId = getQueryString(req.query.tenantId) || 'development';

    const service = getCalendlyRotatorService();
    const link = await service.getNextLink(tenantId);

    if (!link) {
      return res.json({
        success: true,
        link: null,
        message: 'No active Calendly links available',
      });
    }

    return res.json({
      success: true,
      link: {
        id: link.id,
        recruiterName: link.recruiterName,
        calendlyUrl: link.calendlyUrl,
        assignmentCount: link.assignmentCount,
      },
    });
  } catch (error) {
    console.error('[Calendly API] Error getting next link:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get next link',
    });
  }
});

export default router;
